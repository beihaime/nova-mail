import BizError from '../error/biz-error';

/**
 * Canonical JSON for immutable outbound operations. Object keys are sorted at
 * every depth while arrays retain their already-normalised delivery order.
 */
export function canonicalize(value) {
	if (typeof value === 'undefined') return 'null';
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
	return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

export async function snapshotHash(payload) {
	const data = new TextEncoder().encode(canonicalize(payload));
	const digest = await crypto.subtle.digest('SHA-256', data);
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

const snapshots = {
	async loadVerified(c, operationId) {
		const row = await c.env.db.prepare(
			'SELECT canonical_payload, payload_hash FROM outbound_send_snapshot WHERE operation_id = ?'
		).bind(operationId).first();
		if (!row) throw new BizError('Send operation requires manual review', 409);
		let payload;
		try { payload = JSON.parse(row.canonical_payload); }
		catch { throw new BizError('Send operation snapshot is invalid', 409); }
		if (await snapshotHash(payload) !== row.payload_hash) {
			throw new BizError('Send operation snapshot integrity check failed', 409);
		}
		return payload;
	},

	async purge(c, operationId) {
		await c.env.db.batch([
			c.env.db.prepare('DELETE FROM outbound_send_attachment WHERE operation_id = ?').bind(operationId),
			c.env.db.prepare('DELETE FROM outbound_send_snapshot WHERE operation_id = ?').bind(operationId),
		]);
	},
};

export default snapshots;
