import { env } from 'cloudflare:test';
import { dbInit } from '../../src/init/init';

// The Worker owns its schema: `dbInit.init()` is the exact code the production
// one-time `/api/bootstrap` route runs, so building the test database through it
// keeps the integration suite honest about the real column set — including the
// ALTER-based migrations that a hand-written `CREATE TABLE` fixture would miss.
//
// This setup file runs once per test *file* while storage is shared for the
// whole run, so the schema is built only on the first pass. Re-running it is
// harmless (every migration is guarded) but would re-print dozens of expected
// "column already exists" warnings for every suite.
//
// `dbInit.init` expects a Hono context, so it gets a minimal stand-in. Only
// `req.param`, `set`/`get`, `env` and `text` are ever touched.
//
// The secret is read back from the runtime instead of hard-coded: Miniflare
// layers `mail-worker/.dev.vars` on top of `wrangler.vitest.toml`'s `[vars]`,
// so a developer's local file wins and a literal string here would fail only on
// their machine.
async function schemaExists() {
	const row = await env.db
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'email'")
		.first();
	return Boolean(row);
}

function fakeContext() {
	const store = new Map();
	return {
		env,
		req: { param: () => env.jwt_secret },
		set: (key, value) => store.set(key, value),
		get: (key) => store.get(key),
		text: (body, status = 200) => new Response(body, { status }),
		json: (body, status = 200) =>
			new Response(JSON.stringify(body), {
				status,
				headers: { 'Content-Type': 'application/json' },
			}),
	};
}

if (!(await schemaExists())) {
	// Every migration wraps its own DDL in try/catch and logs the failures it
	// tolerates. On a fresh database that is expected noise, not a signal.
	const { warn, error } = console;
	console.warn = () => {};
	console.error = () => {};
	let response;
	try {
		response = await dbInit.init(fakeContext());
	} finally {
		console.warn = warn;
		console.error = error;
	}

	const message = await response.clone().text();
	if (!response.ok || message !== 'success') {
		throw new Error(`integration schema bootstrap failed: ${response.status} ${message}`);
	}
}
