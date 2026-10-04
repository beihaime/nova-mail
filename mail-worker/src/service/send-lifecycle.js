import BizError from '../error/biz-error';

const STALE_RESERVATION_MS = 10 * 60 * 1000;
const FINALIZE_LEASE_MS = 60 * 1000;

function validKey(value) {
	return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

async function requestHash(params) {
	const bytes = new TextEncoder().encode(JSON.stringify(params));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

const sendLifecycle = {
	async reserve(c, { userId, key, params, cost, limit }) {
		if (!validKey(key)) throw new BizError('Invalid send idempotency key');
		const db = c.env.db;
		const hash = await requestHash(params);
		const now = Date.now();
		// Reclaim abandoned reservations only. Dispatching may already have reached
		// a provider, so it must never be automatically released or retried.
		await db.batch([
			db.prepare(`UPDATE user SET send_count = max(0, CAST(send_count AS INTEGER) -
				(SELECT coalesce(sum(quota_cost), 0) FROM outbound_send WHERE user_id = ? AND status = 'reserved' AND updated_at < ?))
				WHERE user_id = ?`).bind(userId, now - STALE_RESERVATION_MS, userId),
			db.prepare("DELETE FROM outbound_send WHERE user_id = ? AND status = 'reserved' AND updated_at < ?")
				.bind(userId, now - STALE_RESERVATION_MS),
		]);

		const operationId = crypto.randomUUID();
		const quotaLimit = limit == null ? Number.MAX_SAFE_INTEGER : limit;
		await db.batch([
			db.prepare(`INSERT OR IGNORE INTO outbound_send
				(operation_id,user_id,request_key,request_hash,status,quota_cost,created_at,updated_at)
				VALUES (?,?,?,?,'reserved',?,?,?)`).bind(operationId, userId, key, hash, cost, now, now),
			db.prepare(`UPDATE user SET send_count = CAST(send_count AS INTEGER) + ?
				WHERE user_id = ? AND EXISTS (SELECT 1 FROM outbound_send WHERE operation_id = ?)
				AND CAST(send_count AS INTEGER) + ? <= ?`)
				.bind(cost, userId, operationId, cost, quotaLimit),
			db.prepare(`DELETE FROM outbound_send WHERE operation_id = ? AND changes() = 0`).bind(operationId),
		]);
		const row = await db.prepare('SELECT * FROM outbound_send WHERE user_id = ? AND request_key = ?')
			.bind(userId, key).first();
		if (!row) throw new BizError('Send quota exceeded', 403);
		if (row.request_hash !== hash) throw new BizError('Idempotency key reused for a different message', 409);
		return row;
	},

	async claimDispatch(c, operationId) {
		const row = await c.env.db.prepare(`UPDATE outbound_send SET status = 'dispatching', updated_at = ?
			WHERE operation_id = ? AND status = 'reserved' RETURNING operation_id`)
			.bind(Date.now(), operationId).first();
		return Boolean(row);
	},

	async accepted(c, operationId, providerId = '') {
		await c.env.db.prepare(`UPDATE outbound_send SET status = 'accepted', provider_id = ?, updated_at = ?
			WHERE operation_id = ? AND status = 'dispatching'`)
			.bind(providerId || '', Date.now(), operationId).run();
	},

	async failedBeforeAcceptance(c, operationId) {
		const db = c.env.db;
		await db.batch([
			db.prepare(`UPDATE user SET send_count = max(0, CAST(send_count AS INTEGER) -
				(SELECT quota_cost FROM outbound_send WHERE operation_id = ? AND status = 'dispatching'))
				WHERE user_id = (SELECT user_id FROM outbound_send WHERE operation_id = ?)`).bind(operationId, operationId),
			db.prepare(`UPDATE outbound_send SET status = 'failed', updated_at = ?
				WHERE operation_id = ? AND status = 'dispatching'`).bind(Date.now(), operationId),
		]);
	},

	async claimFinalize(c, operationId) {
		const now = Date.now();
		const row = await c.env.db.prepare(`UPDATE outbound_send SET status = 'finalizing', updated_at = ?
			WHERE operation_id = ? AND (status = 'accepted' OR (status = 'finalizing' AND updated_at < ?))
			RETURNING operation_id`).bind(now, operationId, now - FINALIZE_LEASE_MS).first();
		return Boolean(row);
	},

	async finalized(c, operationId, emailId) {
		await c.env.db.prepare(`UPDATE outbound_send SET status = 'finalized', email_id = ?, updated_at = ?
			WHERE operation_id = ? AND status = 'finalizing'`)
			.bind(emailId, Date.now(), operationId).run();
	},

	async retryFinalize(c, operationId) {
		await c.env.db.prepare(`UPDATE outbound_send SET status = 'accepted', updated_at = ?
			WHERE operation_id = ? AND status = 'finalizing'`).bind(Date.now(), operationId).run();
	},
};

export default sendLifecycle;
