import r2Service from './r2-service';

const MAX_ATTEMPTS_PER_RUN = 100;

const storageCleanupService = {
	async enqueue(c, keys) {
		const unique = [...new Set((keys || []).filter(Boolean))];
		if (!unique.length) return;
		const now = Date.now();
		await c.env.db.batch(unique.map(key => c.env.db.prepare(
			`INSERT OR IGNORE INTO storage_cleanup (object_key, status, attempts, next_attempt_at, created_at, updated_at)
			 VALUES (?, 'pending', 0, ?, ?, ?)`
		).bind(key, now, now, now)));
	},

	async process(c, limit = MAX_ATTEMPTS_PER_RUN) {
		const now = Date.now();
		const rows = await c.env.db.prepare(
			`SELECT object_key, attempts FROM storage_cleanup
			 WHERE next_attempt_at <= ? ORDER BY created_at LIMIT ?`
		).bind(now, Math.min(Math.max(Number(limit) || 1, 1), MAX_ATTEMPTS_PER_RUN)).all();
		for (const row of rows.results || []) {
			// Frozen outbound snapshots retain content-addressed objects until their
			// operation is finalized or manually resolved. A cleanup job must never
			// invalidate an otherwise safe provider replay.
			const retained = await c.env.db.prepare(`SELECT 1 FROM outbound_send_attachment a
				JOIN outbound_send o ON o.operation_id = a.operation_id
				WHERE o.status != 'finalized' AND a.object_key = ? LIMIT 1`)
				.bind(row.object_key).first();
			if (retained) {
				await c.env.db.prepare('UPDATE storage_cleanup SET next_attempt_at = ?, updated_at = ? WHERE object_key = ?')
					.bind(now + 60 * 60 * 1000, now, row.object_key).run();
				continue;
			}
			try {
				await r2Service.delete(c, row.object_key);
				await c.env.db.prepare('DELETE FROM storage_cleanup WHERE object_key = ?').bind(row.object_key).run();
			} catch (error) {
				const attempts = Number(row.attempts || 0) + 1;
				const delay = Math.min(24 * 60 * 60 * 1000, 60 * 1000 * 2 ** Math.min(attempts, 10));
				await c.env.db.prepare(
					`UPDATE storage_cleanup SET status = 'retrying', attempts = ?, last_error = ?, next_attempt_at = ?, updated_at = ? WHERE object_key = ?`
				).bind(attempts, String(error?.name || 'StorageError').slice(0, 120), now + delay, now, row.object_key).run();
			}
		}
	},
};

export default storageCleanupService;
