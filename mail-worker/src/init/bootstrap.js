const BOOTSTRAP_STATE_KEY = 'schema-bootstrap-v1';

async function matchesBootstrapToken(provided, expected) {
	if (typeof expected !== 'string' || expected.length < 32 || typeof provided !== 'string') {
		return false;
	}

	const encoder = new TextEncoder();
	const [providedHash, expectedHash] = await Promise.all([
		crypto.subtle.digest('SHA-256', encoder.encode(provided)),
		crypto.subtle.digest('SHA-256', encoder.encode(expected))
	]);
	const providedBytes = new Uint8Array(providedHash);
	const expectedBytes = new Uint8Array(expectedHash);
	let difference = 0;

	for (let index = 0; index < expectedBytes.length; index += 1) {
		difference |= providedBytes[index] ^ expectedBytes[index];
	}

	return difference === 0;
}

async function claimBootstrap(db) {
	const results = await db.batch([
		db.prepare(`
			CREATE TABLE IF NOT EXISTS bootstrap_state (
				bootstrap_key TEXT PRIMARY KEY,
				consumed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
		`),
		db.prepare(`
			INSERT OR IGNORE INTO bootstrap_state (bootstrap_key)
			VALUES (?)
		`).bind(BOOTSTRAP_STATE_KEY)
	]);

	return results[1].meta.changes === 1;
}

async function releaseBootstrap(db) {
	await db.prepare('DELETE FROM bootstrap_state WHERE bootstrap_key = ?')
		.bind(BOOTSTRAP_STATE_KEY)
		.run();
}

async function runBootstrap(c, initialize) {
	const provided = c.req.header('X-Bootstrap-Token');
	const expected = c.env.BOOTSTRAP_TOKEN;

	if (!await matchesBootstrapToken(provided, expected)) {
		return c.text('Not found', 404);
	}

	if (!await claimBootstrap(c.env.db)) {
		return c.text('Bootstrap has already been completed', 409);
	}

	try {
		return await initialize(c);
	} catch (error) {
		await releaseBootstrap(c.env.db);
		throw error;
	}
}

export { matchesBootstrapToken, runBootstrap };
