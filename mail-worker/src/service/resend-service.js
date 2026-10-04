import { emailConst } from '../const/entity-const';
import BizError from '../error/biz-error';
import { Resend } from 'resend';
import emailUtils from '../utils/email-utils';

const PROCESSING_LEASE_MS = 60_000;
const EVENT_TYPES = new Set(['email.sent', 'email.delivered', 'email.complained', 'email.bounced', 'email.delivery_delayed', 'email.failed']);

// A recipient can only move forward. A terminal state is never replaced by a
// later provider retry or by a late `sent` event. Complaints take precedence
// because they require operator attention; bounce/failed retain failure rather
// than allowing a delivery for a different recipient to erase it.
const EVENT_STATUS = {
	'email.sent': { status: emailConst.status.SENT, rank: 1, message: null },
	'email.delivery_delayed': { status: emailConst.status.DELAYED, rank: 2, message: null },
	'email.delivered': { status: emailConst.status.DELIVERED, rank: 3, message: null },
	'email.failed': { status: emailConst.status.FAILED, rank: 4, message: null },
	'email.bounced': { status: emailConst.status.BOUNCED, rank: 5, message: null },
	'email.complained': { status: emailConst.status.COMPLAINED, rank: 6, message: null },
};

function eventRecipients(data) {
	const candidate = data?.to ?? data?.recipient ?? data?.email?.to;
	const values = Array.isArray(candidate) ? candidate : candidate ? [candidate] : [];
	return [...new Set(values.map(value => emailUtils.normalizeEmail(
		typeof value === 'string' ? value : value?.email || value?.address
	)).filter(Boolean))];
}

function eventMessage(type, data) {
	if (type === 'email.bounced') return JSON.stringify(data?.bounce ?? null).slice(0, 500);
	if (type === 'email.failed') return String(data?.failed?.reason || '').slice(0, 500);
	return null;
}

function aggregateStatusSql() {
	// Deterministic aggregate: complaint > bounce > failed > all delivered >
	// delayed > sent. Thus neither event order nor a successful recipient can
	// hide a failure for a different recipient.
	return `CASE
		WHEN EXISTS (SELECT 1 FROM resend_recipient_delivery r WHERE r.email_id = email.email_id AND r.status = ${emailConst.status.COMPLAINED}) THEN ${emailConst.status.COMPLAINED}
		WHEN EXISTS (SELECT 1 FROM resend_recipient_delivery r WHERE r.email_id = email.email_id AND r.status = ${emailConst.status.BOUNCED}) THEN ${emailConst.status.BOUNCED}
		WHEN EXISTS (SELECT 1 FROM resend_recipient_delivery r WHERE r.email_id = email.email_id AND r.status = ${emailConst.status.FAILED}) THEN ${emailConst.status.FAILED}
		WHEN EXISTS (SELECT 1 FROM resend_recipient_delivery r WHERE r.email_id = email.email_id) AND NOT EXISTS (SELECT 1 FROM resend_recipient_delivery r WHERE r.email_id = email.email_id AND r.status != ${emailConst.status.DELIVERED}) THEN ${emailConst.status.DELIVERED}
		WHEN EXISTS (SELECT 1 FROM resend_recipient_delivery r WHERE r.email_id = email.email_id AND r.status = ${emailConst.status.DELAYED}) THEN ${emailConst.status.DELAYED}
		ELSE ${emailConst.status.SENT} END`;
}

function legacyMonotonicCondition(status) {
	const terminal = [emailConst.status.BOUNCED, emailConst.status.COMPLAINED, emailConst.status.FAILED];
	if (status === emailConst.status.DELIVERED) return { condition: 'status IN (?, ?)', binds: [emailConst.status.SENT, emailConst.status.DELAYED] };
	if (status === emailConst.status.DELAYED) return { condition: 'status = ?', binds: [emailConst.status.SENT] };
	if (terminal.includes(status)) return { condition: 'status NOT IN (?, ?, ?)', binds: terminal };
	return { condition: 'status = ?', binds: [emailConst.status.SENT] };
}

const resendService = {
	async verifyWebhook(c, payload) {
		const webhookSecret = c.env.resend_webhook_secret;
		if (!webhookSecret) throw new BizError('Resend webhook secret is not configured');
		const resend = new Resend();
		return resend.webhooks.verify({ payload, headers: {
			id: c.req.header('svix-id'), timestamp: c.req.header('svix-timestamp'), signature: c.req.header('svix-signature')
		}, webhookSecret });
	},

	async webhooks(c, body) {
		const eventId = String(body?.id || c.req.header('svix-id') || '').trim();
		const resendEmailId = String(body?.data?.email_id || '').trim();
		if (!eventId || !resendEmailId) throw new BizError('Invalid Resend webhook event');
		const type = String(body.type || '');
		const now = Date.now();
		const known = EVENT_TYPES.has(type);

		// Unknown future events are deliberately terminally ignored: they have no
		// supported state mutation, so retries should not become a hot loop.
		if (!known) {
			await c.env.db.prepare(`INSERT OR IGNORE INTO resend_webhook_event
				(event_id, event_type, resend_email_id, created_at, status, processing_until, applied_at)
				VALUES (?, ?, ?, ?, 'ignored', 0, ?)`).bind(eventId, type, resendEmailId, now, now).run();
			return { ignored: true };
		}

		await c.env.db.prepare(`INSERT OR IGNORE INTO resend_webhook_event
			(event_id, event_type, resend_email_id, created_at, status, processing_until)
			VALUES (?, ?, ?, ?, 'received', 0)`).bind(eventId, type, resendEmailId, now).run();
		const claimed = await c.env.db.prepare(`UPDATE resend_webhook_event SET status = 'processing', processing_until = ?
			WHERE event_id = ? AND (status = 'received' OR (status = 'processing' AND processing_until < ?))`)
			.bind(now + PROCESSING_LEASE_MS, eventId, now).run();
		if (!claimed.meta?.changes) return { replay: true };

		const emailRow = await c.env.db.prepare('SELECT email_id FROM email WHERE resend_email_id = ?').bind(resendEmailId).first();
		if (!emailRow) {
			await c.env.db.prepare(`UPDATE resend_webhook_event SET status = 'ignored', processing_until = 0, applied_at = ?
				WHERE event_id = ? AND status = 'processing'`).bind(now, eventId).run();
			return { ignored: true };
		}

		const detail = { ...EVENT_STATUS[type], message: eventMessage(type, body.data) };
		const recipients = eventRecipients(body.data);
		const mutations = [];
		if (recipients.length) {
			for (const recipient of recipients) {
				mutations.push(c.env.db.prepare(`INSERT INTO resend_recipient_delivery
					(email_id, recipient, status, status_rank, message, updated_at) VALUES (?, ?, ?, ?, ?, ?)
					ON CONFLICT(email_id, recipient) DO UPDATE SET status = excluded.status, status_rank = excluded.status_rank,
					message = excluded.message, updated_at = excluded.updated_at WHERE excluded.status_rank > resend_recipient_delivery.status_rank`)
					.bind(emailRow.email_id, recipient, detail.status, detail.rank, detail.message, now));
			}
			mutations.push(c.env.db.prepare(`UPDATE email SET status = ${aggregateStatusSql()}, message = NULL WHERE email_id = ?`).bind(emailRow.email_id));
		} else {
			// Older Resend payloads did not always carry a recipient. Preserve their
			// message-level monotonic behavior without inventing recipient records.
			const legacy = legacyMonotonicCondition(detail.status);
			mutations.push(c.env.db.prepare(`UPDATE email SET status = ?, message = ? WHERE email_id = ? AND ${legacy.condition}`)
				.bind(detail.status, detail.message, emailRow.email_id, ...legacy.binds));
		}
		mutations.push(c.env.db.prepare(`UPDATE resend_webhook_event SET status = 'applied', processing_until = 0, applied_at = ?
			WHERE event_id = ? AND status = 'processing'`).bind(now, eventId));
		// D1 batch is atomic. If it fails after the claim, release the claim back
		// to `received`; the provider retry can then apply the event instead of
		// treating an incomplete event as permanently deduplicated.
		try {
			await c.env.db.batch(mutations);
		} catch (error) {
			try {
				await c.env.db.prepare(`UPDATE resend_webhook_event SET status = 'received', processing_until = 0 WHERE event_id = ? AND status = 'processing'`)
					.bind(eventId).run();
			} catch (_) {
				// A transient outage can leave the lease in place. It expires quickly
				// and is never treated as an applied duplicate.
			}
			throw error;
		}
		return { updated: true };
	}
};

export { EVENT_STATUS, eventRecipients, aggregateStatusSql };
export default resendService;
