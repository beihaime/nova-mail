import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
	REQUIRED_COLUMNS,
	REQUIRED_INDEXES,
	REQUIRED_INVARIANTS,
	REQUIRED_TABLES,
	checkSchema,
} from '../scripts/schema-manifest.mjs';

/**
 * The deployment refuses to release Worker code unless the database satisfies
 * this manifest. These tests pin the pass/fail behaviour, including the exact
 * missing-invariant reporting the workflow shows an operator.
 */

function completeSchema() {
	return {
		tables: [...REQUIRED_TABLES],
		indexes: [...REQUIRED_INDEXES],
		columns: Object.entries(REQUIRED_COLUMNS).flatMap(([table, list]) =>
			list.map((column) => `${table}.${column}`)),
		invariants: { ...REQUIRED_INVARIANTS },
	};
}

describe('required-schema checker', () => {
	it('accepts a fully migrated database', () => {
		const result = checkSchema(completeSchema());
		expect(result).toEqual({ ok: true, missing: [], violations: [] });
	});

	it('accepts columns given as a table→columns map', () => {
		const actual = completeSchema();
		actual.columns = Object.fromEntries(
			Object.entries(REQUIRED_COLUMNS).map(([table, list]) => [table, [...list]]),
		);
		expect(checkSchema(actual).ok).toBe(true);
	});

	it('names a missing column', () => {
		const actual = completeSchema();
		actual.columns = actual.columns.filter((column) => column !== 'email.send_operation_id');

		const result = checkSchema(actual);
		expect(result.ok).toBe(false);
		expect(result.missing).toEqual(['column email.send_operation_id']);
		expect(result.violations).toEqual([]);
	});

	it('names a missing table and index', () => {
		const actual = completeSchema();
		actual.tables = actual.tables.filter((table) => table !== 'outbound_send_snapshot');
		actual.indexes = actual.indexes.filter((index) => index !== 'idx_email_send_operation');

		const result = checkSchema(actual);
		expect(result.ok).toBe(false);
		expect(result.missing).toEqual([
			'table outbound_send_snapshot',
			'index idx_email_send_operation',
		]);
	});

	it('rejects non-canonical mailbox identities before deploy', () => {
		const actual = completeSchema();
		actual.invariants.noncanonical_user = 2;

		const result = checkSchema(actual);
		expect(result.ok).toBe(false);
		expect(result.missing).toEqual([]);
		expect(result.violations).toEqual(['invariant noncanonical_user: expected 0, got 2']);
	});

	it('fails closed when an invariant count is missing entirely', () => {
		const actual = completeSchema();
		delete actual.invariants.noncanonical_account;
		const result = checkSchema(actual);
		expect(result.ok).toBe(false);
		expect(result.violations).toEqual(['invariant noncanonical_account: expected 0, got undefined']);
	});
});

describe('required-schema CLI', () => {
	const script = fileURLToPath(new URL('../scripts/check-schema.mjs', import.meta.url));

	it('exits 0 and reports a satisfied schema', () => {
		const run = spawnSync(process.execPath, [script], {
			input: JSON.stringify(completeSchema()),
			encoding: 'utf8',
		});
		expect(run.status).toBe(0);
		expect(run.stdout).toContain('Deployed schema satisfies');
	});

	it('exits non-zero and names the missing invariant', () => {
		const actual = completeSchema();
		actual.invariants.noncanonical_user = 5;
		const run = spawnSync(process.execPath, [script], {
			input: JSON.stringify(actual),
			encoding: 'utf8',
		});
		expect(run.status).toBe(1);
		expect(run.stderr).toContain('invariant noncanonical_user: expected 0, got 5');
	});
});
