import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	REQUIRED_COLUMNS,
	REQUIRED_INDEXES,
	REQUIRED_TABLES,
} from '../scripts/schema-manifest.mjs';
import {
	INDEXES_QUERY,
	INVARIANTS_QUERY,
	TABLES_QUERY,
	columnQuery,
	readQueryOutcome,
	sanitizeDiagnostic,
	verifyDeployedSchema,
} from '../scripts/verify-schema.mjs';

/**
 * The deployment schema gate must fail visibly. `wrangler d1 execute --json`
 * reports errors as JSON on *stdout* with a non-zero exit code; the previous
 * shell verifier captured that in `$(...)` under `set -e` and aborted with no
 * diagnostic at all (the failure that stopped the 6c0cee4 deployment). These
 * tests pin the explicit exit-code/`.success` handling and the D1-compatible
 * per-table column inspection.
 */

const verifyMjs = fileURLToPath(new URL('../scripts/verify-schema.mjs', import.meta.url));

function wranglerOk(rows) {
	return { status: 0, stdout: JSON.stringify([{ results: rows, success: true, meta: {} }]), stderr: '' };
}

function completeColumns() {
	return Object.fromEntries(
		Object.entries(REQUIRED_COLUMNS).map(([table, list]) => [table, [...list]]),
	);
}

function createExecutor({ tables, indexes, columnsByTable, invariants, failTables }) {
	const seen = [];
	const execute = (sql) => {
		seen.push(sql);
		if (sql === TABLES_QUERY) {
			if (failTables) return failTables;
			return wranglerOk(tables.map((name) => ({ name })));
		}
		if (sql === INDEXES_QUERY) return wranglerOk(indexes.map((name) => ({ name })));
		if (sql === INVARIANTS_QUERY) return wranglerOk([invariants]);
		const match = sql.match(/^SELECT name FROM pragma_table_info\('([^']+)'\)$/);
		if (match) return wranglerOk((columnsByTable[match[1]] || []).map((name) => ({ name })));
		throw new Error(`unexpected SQL: ${sql}`);
	};
	return { execute, seen };
}

function collector() {
	const lines = [];
	return { lines, sink: (...args) => lines.push(args.join(' ')) };
}

const FULL = () => ({
	tables: [...REQUIRED_TABLES, 'setting', 'role'],
	indexes: [...REQUIRED_INDEXES, 'idx_unrelated'],
	columnsByTable: completeColumns(),
	invariants: { noncanonical_user: 0, noncanonical_account: 0 },
});

describe('wrangler outcome handling', () => {
	it('accepts a successful result set', () => {
		const outcome = readQueryOutcome(wranglerOk([{ name: 'user' }]));
		expect(outcome.ok).toBe(true);
		expect(outcome.sets[0].results).toEqual([{ name: 'user' }]);
	});

	it('surfaces the D1 error when wrangler exits non-zero with JSON on stdout', () => {
		const outcome = readQueryOutcome({
			status: 1,
			stdout: JSON.stringify({ error: { text: 'not authorized: SQLITE_AUTH' } }),
			stderr: '',
		});
		expect(outcome.ok).toBe(false);
		expect(outcome.message).toBe('not authorized: SQLITE_AUTH');
	});

	it('fails on success:false even when the exit code is zero', () => {
		const outcome = readQueryOutcome({
			status: 0,
			stdout: JSON.stringify([{ results: [], success: false, error: { text: 'D1_ERROR: boom' } }]),
			stderr: '',
		});
		expect(outcome.ok).toBe(false);
		expect(outcome.message).toBe('D1_ERROR: boom');
	});

	it('fails on unparseable output instead of guessing', () => {
		const outcome = readQueryOutcome({ status: 0, stdout: 'not json', stderr: '' });
		expect(outcome.ok).toBe(false);
		expect(outcome.message).toContain('unparseable wrangler output');
	});

	it('strips ANSI escapes and truncates long diagnostics', () => {
		expect(sanitizeDiagnostic('\u001B[31mboom\u001B[0m')).toBe('boom');
		expect(sanitizeDiagnostic('x'.repeat(2000)).length).toBeLessThanOrEqual(501);
	});
});

describe('column inspection queries', () => {
	it('uses one simple literal pragma query per table', () => {
		expect(columnQuery('email')).toBe("SELECT name FROM pragma_table_info('email')");
		expect(columnQuery('outbound_send_snapshot'))
			.toBe("SELECT name FROM pragma_table_info('outbound_send_snapshot')");
	});

	it('refuses anything that is not a plain identifier', () => {
		expect(() => columnQuery("email'); DROP TABLE email; --")).toThrow(/unsafe table name/);
	});
});

describe('verifyDeployedSchema', () => {
	it('passes on a fully migrated existing database', async () => {
		const { execute } = createExecutor(FULL());
		const out = collector();
		const result = await verifyDeployedSchema({ execute, log: out.sink, errorLog: out.sink });
		expect(result.ok).toBe(true);
		expect(out.lines.join('\n')).toContain('✅ Deployed schema satisfies');
	});

	it('continues to every query after a successful one', async () => {
		const { execute, seen } = createExecutor(FULL());
		await verifyDeployedSchema({ execute, log: () => {}, errorLog: () => {} });
		expect(seen[0]).toBe(TABLES_QUERY);
		expect(seen).toContain(INDEXES_QUERY);
		expect(seen).toContain(INVARIANTS_QUERY);
	});

	it('reports exactly which table, column and index are missing', async () => {
		const fixture = FULL();
		fixture.tables = fixture.tables.filter((table) => table !== 'outbound_send');
		fixture.columnsByTable.email = fixture.columnsByTable.email.filter((column) => column !== 'thread_id');
		fixture.indexes = fixture.indexes.filter((index) => index !== 'idx_email_mailbox_message_id_unique');

		const { execute } = createExecutor(fixture);
		const out = collector();
		const result = await verifyDeployedSchema({ execute, log: out.sink, errorLog: out.sink });
		const report = out.lines.join('\n');

		expect(result.ok).toBe(false);
		expect(report).toContain('   - table outbound_send');
		expect(report).toContain('   - column email.thread_id');
		expect(report).toContain('   - index idx_email_mailbox_message_id_unique');
	});

	it('reports a violated identity invariant', async () => {
		const fixture = FULL();
		fixture.invariants = { noncanonical_user: 3, noncanonical_account: 0 };
		const { execute } = createExecutor(fixture);
		const out = collector();
		const result = await verifyDeployedSchema({ execute, log: out.sink, errorLog: out.sink });

		expect(result.ok).toBe(false);
		expect(out.lines.join('\n')).toContain('invariant noncanonical_user: expected 0, got 3');
	});

	it('prints the safe D1 error and stops when a query fails non-zero', async () => {
		const fixture = FULL();
		fixture.failTables = {
			status: 1,
			stdout: JSON.stringify({ error: { text: 'not authorized: SQLITE_AUTH' } }),
			stderr: '',
		};
		const { execute, seen } = createExecutor(fixture);
		const out = collector();
		const result = await verifyDeployedSchema({ execute, log: out.sink, errorLog: out.sink });

		expect(result.ok).toBe(false);
		expect(out.lines[0]).toBe('Schema verification query failed: not authorized: SQLITE_AUTH');
		// The failure is reported, not swallowed, and later queries do not run
		// against meaningless data.
		expect(seen).toEqual([TABLES_QUERY]);
	});

	it('never builds a compound pragma query', async () => {
		const { execute, seen } = createExecutor(FULL());
		await verifyDeployedSchema({ execute, log: () => {}, errorLog: () => {} });

		expect(seen.some((sql) => /UNION\s+ALL/i.test(sql))).toBe(false);
		const columnQueries = seen.filter((sql) => sql.includes('pragma_table_info('));
		expect(columnQueries).toEqual(Object.keys(REQUIRED_COLUMNS).map(columnQuery));
	});
});

// A fake `pnpm` on PATH exercises the real CLI (argument handling, exit codes,
// stderr) without touching Cloudflare.
const shimRoot = mkdtempSync(path.join(tmpdir(), 'nova-verify-shim-'));
const shimDir = path.join(shimRoot, 'bin');
const fixturePath = path.join(shimRoot, 'fixture.json');
mkdirSync(shimDir, { recursive: true });

const SHIM = `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const commandIndex = args.indexOf('--command');
const sql = commandIndex > -1 ? args[commandIndex + 1] : '';
const fixture = JSON.parse(fs.readFileSync(process.env.VERIFY_FIXTURE, 'utf8'));
let key = 'other';
if (sql === fixture.queries.tables) key = 'tables';
else if (sql === fixture.queries.indexes) key = 'indexes';
else if (sql === fixture.queries.invariants) key = 'invariants';
else {
  const match = sql.match(/pragma_table_info\\('([^']+)'\\)/);
  if (match) key = 'columns:' + match[1];
}
const entry = fixture.responses[key] || { status: 0, stdout: '[{"results":[],"success":true}]' };
process.stdout.write(entry.stdout || '');
if (entry.stderr) process.stderr.write(entry.stderr);
process.exit(entry.status == null ? 0 : entry.status);
`;
writeFileSync(path.join(shimDir, 'pnpm'), SHIM);
chmodSync(path.join(shimDir, 'pnpm'), 0o755);

function writeFixture(fixture) {
	writeFileSync(fixturePath, JSON.stringify(fixture));
}

function runCli() {
	return spawnSync(process.execPath, [verifyMjs, 'test-database-id'], {
		encoding: 'utf8',
		env: {
			...process.env,
			PATH: `${shimDir}${path.delimiter}${process.env.PATH}`,
			VERIFY_FIXTURE: fixturePath,
		},
	});
}

function fixtureFor(fixture, overrideTables) {
	const responses = {
		tables: wranglerOk(fixture.tables.map((name) => ({ name }))),
		indexes: wranglerOk(fixture.indexes.map((name) => ({ name }))),
		invariants: wranglerOk([fixture.invariants]),
	};
	for (const [table, columns] of Object.entries(fixture.columnsByTable)) {
		responses[`columns:${table}`] = wranglerOk(columns.map((name) => ({ name })));
	}
	if (overrideTables) responses.tables = overrideTables;
	return {
		queries: { tables: TABLES_QUERY, indexes: INDEXES_QUERY, invariants: INVARIANTS_QUERY },
		responses,
	};
}

describe('verify-schema CLI', () => {
	it('exits 0 for a fully migrated database', () => {
		writeFixture(fixtureFor(FULL()));
		const run = runCli();
		expect(run.status).toBe(0);
		expect(run.stdout).toContain('✅ Deployed schema satisfies');
	});

	it('exits non-zero with a visible diagnostic when wrangler fails', () => {
		writeFixture(fixtureFor(FULL(), {
			status: 1,
			stdout: JSON.stringify({ error: { text: 'not authorized: SQLITE_AUTH' } }),
		}));
		const run = runCli();
		expect(run.status).toBe(1);
		expect(run.stderr).toContain('Schema verification query failed: not authorized: SQLITE_AUTH');
	});

	it('shows the exact missing object from the manifest on the CLI too', () => {
		const fixture = FULL();
		fixture.columnsByTable.email = fixture.columnsByTable.email
			.filter((column) => column !== 'send_operation_id');
		writeFixture(fixtureFor(fixture));
		const run = runCli();
		expect(run.status).toBe(1);
		expect(run.stderr).toContain('column email.send_operation_id');
	});
});

afterAll(() => {
	rmSync(shimRoot, { recursive: true, force: true });
});
