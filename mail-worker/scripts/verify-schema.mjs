#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
	REQUIRED_COLUMNS,
	REQUIRED_INDEXES,
	REQUIRED_TABLES,
	checkSchema,
} from './schema-manifest.mjs';

/**
 * Deployment schema gate: read the deployed D1 database and assert it against
 * `schema-manifest.mjs`.
 *
 * The D1 interaction lives here rather than in Bash so that it is unit-testable
 * and can never silently swallow a Wrangler error. Two behaviours matter:
 *
 *   1. `wrangler d1 execute --json` prints structured errors to **stdout** and
 *      exits non-zero. Capturing that in a `$(...)` under `set -e` used to abort
 *      the shell verifier with no diagnostic at all. Here every query's exit
 *      code, stdout and stderr are captured explicitly and `.success` is
 *      validated before the payload is used.
 *   2. D1 authorizes `pragma_table_info` only with a literal argument (dynamic
 *      or compound uses raise `SQLITE_AUTH`), so columns are read one table at
 *      a time with a simple, literal query. No `UNION ALL` is generated.
 *
 * Only repository-owned identifiers ever reach SQL: the table names come from
 * `schema-manifest.mjs`, never from user input, and each is re-validated.
 */

const QUERY_TIMEOUT_MS = 120000;
const MAX_DIAGNOSTIC = 500;

export const TABLES_QUERY = "SELECT name FROM sqlite_master WHERE type = 'table'";
export const INDEXES_QUERY = "SELECT name FROM sqlite_master WHERE type = 'index'";
export const INVARIANTS_QUERY = 'SELECT (SELECT count(*) FROM user WHERE email != lower(trim(email))) AS noncanonical_user, (SELECT count(*) FROM account WHERE email != lower(trim(email))) AS noncanonical_account';

/** Remove terminal escape sequences so a diagnostic is readable in a log. */
export function stripAnsi(value) {
	return String(value ?? '').replace(/\u001B\[[0-9;]*[A-Za-z]/g, '');
}

/** Collapse a diagnostic to one short, credential-free line. */
export function sanitizeDiagnostic(value, max = MAX_DIAGNOSTIC) {
	const text = stripAnsi(value).replace(/\s+/g, ' ').trim();
	if (!text) return '';
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** A simple, literal `pragma_table_info` query for one manifest table. */
export function columnQuery(table) {
	// Belt and braces: the manifest is repository-owned, but never let an
	// unexpected identifier reach SQL.
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(table))) {
		throw new Error(`unsafe table name in schema manifest: ${table}`);
	}
	return `SELECT name FROM pragma_table_info('${table}')`;
}

function errorText(error) {
	if (error == null) return '';
	if (typeof error === 'string') return sanitizeDiagnostic(error);
	if (typeof error === 'object') {
		return sanitizeDiagnostic(error.text || error.message || error.detail || JSON.stringify(error));
	}
	return sanitizeDiagnostic(String(error));
}

/**
 * Interpret one `wrangler d1 execute --json` invocation.
 *
 * @param {{ status?: number|null, stdout?: string, stderr?: string }} result
 * @returns {{ ok: true, sets: any[] } | { ok: false, message: string }}
 */
export function readQueryOutcome(result = {}) {
	const status = result.status;
	const stdout = String(result.stdout ?? '');
	const stderr = String(result.stderr ?? '');
	const trimmed = stdout.trim();

	let parsed = null;
	let parsedOk = false;
	if (trimmed) {
		try {
			parsed = JSON.parse(trimmed);
			parsedOk = true;
		} catch {
			parsedOk = false;
		}
	}

	// Wrangler prints `{ "error": { "text": "..." } }` on stdout and exits 1.
	if (parsedOk && parsed && !Array.isArray(parsed) && parsed.error) {
		return { ok: false, message: errorText(parsed.error) || 'wrangler reported an error' };
	}

	if (typeof status === 'number' && status !== 0) {
		const message = errorText(parsed?.error)
			|| sanitizeDiagnostic(parsed?.message)
			|| sanitizeDiagnostic(stderr)
			|| sanitizeDiagnostic(stdout)
			|| `wrangler exited with status ${status}`;
		return { ok: false, message };
	}

	if (status === null || status === undefined) {
		return { ok: false, message: sanitizeDiagnostic(stderr) || 'wrangler did not report an exit status' };
	}

	if (!parsedOk) {
		return {
			ok: false,
			message: `unparseable wrangler output: ${sanitizeDiagnostic(stdout || stderr) || 'empty output'}`,
		};
	}

	const sets = Array.isArray(parsed) ? parsed : [parsed];
	for (const set of sets) {
		if (set && set.success === false) {
			return { ok: false, message: errorText(set.error) || 'wrangler reported success=false' };
		}
	}

	return { ok: true, sets };
}

function firstRows(sets) {
	const results = Array.isArray(sets) ? sets[0]?.results : null;
	return Array.isArray(results) ? results : [];
}

/**
 * Query the deployed database and compare it with the manifest.
 *
 * @param {{
 *   execute: (sql: string) => ({ status?: number|null, stdout?: string, stderr?: string }) | Promise<...>,
 *   log?: (...args: any[]) => void,
 *   errorLog?: (...args: any[]) => void,
 * }} options
 */
export async function verifyDeployedSchema({ execute, log = console.log, errorLog = console.error }) {
	async function run(label, sql) {
		let outcome;
		try {
			outcome = readQueryOutcome(await execute(sql));
		} catch (error) {
			errorLog(`Schema verification query failed: ${sanitizeDiagnostic(error?.message) || 'the schema query could not be executed'}`);
			errorLog(`  while checking: ${label}`);
			return null;
		}
		if (!outcome.ok) {
			errorLog(`Schema verification query failed: ${outcome.message}`);
			errorLog(`  while checking: ${label}`);
			return null;
		}
		return outcome.sets;
	}

	const tableSets = await run('required tables', TABLES_QUERY);
	if (!tableSets) return { ok: false };
	const tables = firstRows(tableSets).map((row) => row.name);

	const indexSets = await run('required indexes', INDEXES_QUERY);
	if (!indexSets) return { ok: false };
	const indexes = firstRows(indexSets).map((row) => row.name);

	const columns = [];
	for (const table of Object.keys(REQUIRED_COLUMNS)) {
		const sets = await run(`columns for ${table}`, columnQuery(table));
		if (!sets) return { ok: false };
		for (const row of firstRows(sets)) columns.push(`${table}.${row.name}`);
	}

	const invariantSets = await run('canonical mailbox identities', INVARIANTS_QUERY);
	if (!invariantSets) return { ok: false };
	const invariants = firstRows(invariantSets)[0] || {};

	const result = checkSchema({ tables, indexes, columns, invariants });
	if (result.ok) {
		const columnCount = Object.values(REQUIRED_COLUMNS).reduce((n, list) => n + list.length, 0);
		log(`✅ Deployed schema satisfies ${REQUIRED_TABLES.length} tables, ${columnCount} columns `
			+ `(checked one table at a time), ${REQUIRED_INDEXES.length} indexes and canonical mailbox identities.`);
		return { ok: true, ...result };
	}

	errorLog('❌ The deployed D1 does not satisfy the schema the current Worker requires:');
	for (const item of [...result.missing, ...result.violations]) errorLog(`   - ${item}`);
	return { ok: false, ...result };
}

/**
 * The production executor: one read-only `wrangler d1 execute` per query.
 * `dbId` is passed as an argv element, never interpolated into a shell.
 */
export function createWranglerExecute({ dbId, cwd = process.cwd(), pnpm = 'pnpm', timeout = QUERY_TIMEOUT_MS }) {
	return (sql) => {
		const result = spawnSync(
			pnpm,
			['wrangler', 'd1', 'execute', dbId, '--remote', '--yes', '--json', '--command', sql],
			{ cwd, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 },
		);
		if (result.error) {
			return {
				status: typeof result.status === 'number' ? result.status : 1,
				stdout: result.stdout || '',
				stderr: `${result.stderr || ''} ${result.error.message || ''}`,
			};
		}
		return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
	};
}

async function main() {
	const dbId = process.argv[2];
	if (!dbId) {
		console.error('usage: verify-schema.mjs <d1-database-id>');
		process.exit(2);
	}
	const result = await verifyDeployedSchema({ execute: createWranglerExecute({ dbId }) });
	process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
