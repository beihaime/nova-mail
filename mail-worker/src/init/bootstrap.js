const BOOTSTRAP_STATE_KEY = 'schema-bootstrap-v1';

function isMissingTable(error) {
	return /no such table/i.test(String(error?.message || error));
}

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

/**
 * A populated setting record is created by the initial schema setup and is
 * retained by every supported Nova Mail installation.  Unlike the bootstrap
 * marker, it also exists on installations created before this mechanism.
 */
async function isApplicationInitialized(db) {
	try {
		return Boolean(await db.prepare('SELECT 1 AS initialized FROM setting LIMIT 1').first());
	} catch (error) {
		if (isMissingTable(error)) {
			return false;
		}
		throw error;
	}
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

	// Do this before creating bootstrap_state so legacy installations are not
	// mutated merely by receiving an attempted bootstrap request.
	if (await isApplicationInitialized(c.env.db)) {
		return c.text('Bootstrap has already been completed', 409);
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

export { isApplicationInitialized, matchesBootstrapToken, runBootstrap };
