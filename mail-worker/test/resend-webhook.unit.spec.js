import { beforeEach, describe, expect, it } from 'vitest';
import resendService, { EVENT_STATUS, eventRecipients } from '../src/service/resend-service';
import { emailConst } from '../src/const/entity-const';

class FakeD1 {
	constructor() {
		this.events = new Map();
		this.recipients = new Map();
		this.email = { email_id: 7, resend_email_id: 're_1', status: emailConst.status.SENT, message: null };
		this.failNextBatch = false;
		this.batchCalls = 0;
	}
	prepare(sql) {
		const db = this;
		let binds = [];
		const statement = {
			sql,
			bind(...values) { binds = values; return this; },
			async run() {
				if (sql.includes('INSERT OR IGNORE INTO resend_webhook_event')) {
					const [id, type, resendId, created, fifth] = binds;
					const status = sql.includes("'ignored'") ? 'ignored' : 'received';
					const applied = status === 'ignored' ? fifth : null;
					if (!db.events.has(id)) db.events.set(id, { id, type, resendId, created, status, processingUntil: 0, applied });
					return { meta: { changes: 1 } };
				}
				if (sql.startsWith('UPDATE resend_webhook_event SET status = \'processing\'')) {
					const [until, id] = binds; const event = db.events.get(id);
					if (event && (event.status === 'received' || (event.status === 'processing' && event.processingUntil < Date.now()))) {
						event.status = 'processing'; event.processingUntil = until; return { meta: { changes: 1 } };
					}
					return { meta: { changes: 0 } };
				}
				if (sql.includes("SET status = 'ignored'")) { const [applied, id] = binds; const event = db.events.get(id); event.status = 'ignored'; event.applied = applied; return { meta: { changes: 1 } }; }
				if (sql.includes("SET status = 'received'")) { const [id] = binds; const event = db.events.get(id); if (event?.status === 'processing') { event.status = 'received'; event.processingUntil = 0; } return { meta: { changes: 1 } }; }
				return { meta: { changes: 1 } };
			},
			async first() {
				if (sql.startsWith('SELECT email_id FROM email')) return binds[0] === db.email.resend_email_id ? db.email : null;
				return null;
			}
		};
		return statement;
	}
	async batch(statements) {
		this.batchCalls++;
		if (this.failNextBatch) { this.failNextBatch = false; throw new Error('forced status write failure'); }
		for (const { sql, _binds } of statements.map(statement => ({ sql: statement.sql, _binds: statement.bind ? undefined : undefined }))) void sql;
		// Read the actual statement closures by reinterpreting their bound values.
		for (const statement of statements) {
			if (statement.sql.includes('INSERT INTO resend_recipient_delivery')) {
				// bound data is intentionally exposed by this test fake's wrapper below
				const values = statement.values;
				const [emailId, recipient, status, rank, message] = values;
				const previous = this.recipients.get(recipient);
				if (!previous || rank > previous.rank) this.recipients.set(recipient, { emailId, status, rank, message });
			}
			if (statement.sql.startsWith('UPDATE email SET status = CASE')) {
				const values = [...this.recipients.values()].map(row => row.status);
				this.email.status = values.includes(emailConst.status.COMPLAINED) ? emailConst.status.COMPLAINED
					: values.includes(emailConst.status.BOUNCED) ? emailConst.status.BOUNCED
					: values.includes(emailConst.status.FAILED) ? emailConst.status.FAILED
					: values.length && values.every(status => status === emailConst.status.DELIVERED) ? emailConst.status.DELIVERED
					: values.includes(emailConst.status.DELAYED) ? emailConst.status.DELAYED : emailConst.status.SENT;
			}
			if (statement.sql.includes("SET status = 'applied'")) {
				const [, id] = statement.values; const event = this.events.get(id); event.status = 'applied'; event.processingUntil = 0;
			}
		}
	}
}

// Preserve bind values on fake statements without changing production code.
const originalPrepare = FakeD1.prototype.prepare;
FakeD1.prototype.prepare = function (sql) {
	const statement = originalPrepare.call(this, sql);
	const bind = statement.bind;
	statement.bind = function (...values) { this.values = values; return bind.call(this, ...values); };
	return statement;
};

function context(db) { return { env: { db }, req: { header: () => '' } }; }
function event(id, type, recipient = 'a@example.com') { return { id, type, data: { email_id: 're_1', to: [recipient] } }; }

describe('Resend webhook durable processing', () => {
	let db;
	beforeEach(() => { db = new FakeD1(); });

	it('retries an event after its status batch fails, then applies it exactly once', async () => {
		db.failNextBatch = true;
		await expect(resendService.webhooks(context(db), event('evt-1', 'email.delivered'))).rejects.toThrow('forced status write failure');
		expect(db.events.get('evt-1').status).toBe('received');
		await expect(resendService.webhooks(context(db), event('evt-1', 'email.delivered'))).resolves.toEqual({ updated: true });
		expect(db.events.get('evt-1').status).toBe('applied');
		expect(db.email.status).toBe(emailConst.status.DELIVERED);
		await expect(resendService.webhooks(context(db), event('evt-1', 'email.delivered'))).resolves.toEqual({ replay: true });
		expect(db.batchCalls).toBe(2);
	});

	it('claims concurrent duplicate deliveries only once', async () => {
		const results = await Promise.all([
			resendService.webhooks(context(db), event('evt-concurrent', 'email.delivered')),
			resendService.webhooks(context(db), event('evt-concurrent', 'email.delivered')),
		]);
		expect(results.filter(result => result.updated)).toHaveLength(1);
		expect(results.filter(result => result.replay)).toHaveLength(1);
		expect(db.batchCalls).toBe(1);
	});

	it('uses recipient state and a deterministic aggregate independent of event order', async () => {
		await resendService.webhooks(context(db), event('evt-a', 'email.delivered', 'a@example.com'));
		await resendService.webhooks(context(db), event('evt-b', 'email.bounced', 'b@example.com'));
		expect(db.email.status).toBe(emailConst.status.BOUNCED);
		expect(db.recipients.get('a@example.com').status).toBe(emailConst.status.DELIVERED);
		expect(db.recipients.get('b@example.com').status).toBe(emailConst.status.BOUNCED);
		await resendService.webhooks(context(db), event('evt-late', 'email.sent', 'a@example.com'));
		expect(db.recipients.get('a@example.com').status).toBe(emailConst.status.DELIVERED);
		expect(db.email.status).toBe(emailConst.status.BOUNCED);
	});

	it('makes unknown types intentionally ignored and rejects malformed events', async () => {
		await expect(resendService.webhooks(context(db), event('evt-x', 'email.future'))).resolves.toEqual({ ignored: true });
		expect(db.events.get('evt-x').status).toBe('ignored');
		await expect(resendService.webhooks(context(db), { id: 'bad', data: {} })).rejects.toThrow('Invalid Resend webhook event');
	});

	it('normalizes recipient identities and has explicit transition ranks', () => {
		expect(eventRecipients({ to: [' A@Example.com ', { address: 'b@example.com' }, 'a@example.com'] })).toEqual(['a@example.com', 'b@example.com']);
		expect(EVENT_STATUS['email.delivered'].rank).toBeGreaterThan(EVENT_STATUS['email.sent'].rank);
		expect(EVENT_STATUS['email.bounced'].rank).toBeGreaterThan(EVENT_STATUS['email.delivered'].rank);
	});
});
