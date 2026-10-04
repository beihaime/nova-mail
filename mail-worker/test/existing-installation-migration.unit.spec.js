import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Guards the *existing-installation* migration path.
 *
 * `dbInit` (src/init/init.js) builds the schema that new installations get from
 * the one-time `/api/bootstrap` route, and the integration harness proves that
 * path works. An existing D1 can never bootstrap again (the route answers 409),
 * so v3.16 – v3.23 must also exist as forward-only SQL applied by the deployment
 * workflow. When that wiring was missing, a released Worker queried
 * `email.send_operation_id` / `outbound_send` against a database that did not
 * have them and every request answered "Please update the database as
 * documented".
 */

const tablesSql = readFileSync(
	new URL('../migrations/v3_16_send_lifecycle.sql', import.meta.url),
	'utf8',
);
const indexesSql = readFileSync(
	new URL('../migrations/v3_16_send_lifecycle_indexes.sql', import.meta.url),
	'utf8',
);
const workflow = readFileSync(
	new URL('../../.github/workflows/deploy-cloudflare.yml', import.meta.url),
	'utf8',
);

// The ALTER-only columns cannot live in plain SQL (SQLite has no
// `ADD COLUMN IF NOT EXISTS`), so the workflow adds them behind
// `pragma_table_info` guards. This mirrors those definitions exactly.
const WORKFLOW_COLUMNS = [
	['email', 'send_operation_id', "TEXT NOT NULL DEFAULT ''"],
	['attachments', 'send_operation_id', "TEXT NOT NULL DEFAULT ''"],
	['attachments', 'send_ordinal', 'INTEGER NOT NULL DEFAULT -1'],
	['outbound_send', 'reconcile_lease_until', 'INTEGER NOT NULL DEFAULT 0'],
	['outbound_send', 'reconcile_lease_token', "TEXT NOT NULL DEFAULT ''"],
	['resend_webhook_event', 'status', "TEXT NOT NULL DEFAULT 'received'"],
	['resend_webhook_event', 'processing_until', 'INTEGER NOT NULL DEFAULT 0'],
	['resend_webhook_event', 'applied_at', 'INTEGER'],
];

let DatabaseSync = null;
try {
	({ DatabaseSync } = await import('node:sqlite'));
} catch {
	DatabaseSync = null;
}

const describeSqlite = DatabaseSync ? describe : describe.skip;

function legacyDatabase() {
	const db = new DatabaseSync(':memory:');
	db.exec(`
		CREATE TABLE email (email_id INTEGER PRIMARY KEY, type INTEGER, account_id INTEGER, to_email TEXT);
		CREATE TABLE attachments (att_id INTEGER PRIMARY KEY, email_id INTEGER, type INTEGER);
	`);
	return db;
}

function names(db, sql) {
	return db.prepare(sql).all().map((row) => row.name);
}

const tableNames = (db) => names(db, "SELECT name FROM sqlite_master WHERE type = 'table'");
const indexNames = (db) => names(db, "SELECT name FROM sqlite_master WHERE type = 'index'");
const columnNames = (db, table) => names(db, `SELECT name FROM pragma_table_info('${table}')`);

function applyWorkflowColumns(db) {
	for (const [table, column, definition] of WORKFLOW_COLUMNS) {
		if (!columnNames(db, table).includes(column)) {
			db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
		}
	}
}

describeSqlite('existing-installation send lifecycle migration', () => {
	it('creates the v3.16 – v3.23 objects on a legacy database', () => {
		const db = legacyDatabase();

		db.exec(tablesSql);
		applyWorkflowColumns(db);
		db.exec(indexesSql);

		expect(tableNames(db)).toEqual(
			expect.arrayContaining([
				'outbound_send',
				'outbound_send_snapshot',
				'outbound_send_attachment',
				'storage_cleanup',
				'resend_webhook_event',
				'resend_recipient_delivery',
			]),
		);

		expect(columnNames(db, 'email')).toContain('send_operation_id');
		expect(columnNames(db, 'attachments')).toEqual(
			expect.arrayContaining(['send_operation_id', 'send_ordinal']),
		);
		expect(columnNames(db, 'outbound_send')).toEqual(
			expect.arrayContaining(['reconcile_lease_until', 'reconcile_lease_token']),
		);

		expect(indexNames(db)).toEqual(
			expect.arrayContaining([
				'idx_outbound_send_user_status',
				'idx_outbound_send_reconcile',
				'idx_outbound_send_attachment_key',
				'idx_storage_cleanup_due',
				'idx_email_send_operation',
				'idx_attachment_send_operation',
			]),
		);
	});

	it('is idempotent when a partially applied database is migrated again', () => {
		const db = legacyDatabase();

		db.exec(tablesSql);
		applyWorkflowColumns(db);
		db.exec(indexesSql);

		// A second run — table created but a later column, then the indexes —
		// must not throw and must not duplicate anything.
		expect(() => {
			db.exec(tablesSql);
			// Simulate the partial state: drop one of the late columns.
			db.exec('ALTER TABLE outbound_send DROP COLUMN reconcile_lease_token');
			applyWorkflowColumns(db);
			db.exec(indexesSql);
		}).not.toThrow();

		expect(columnNames(db, 'outbound_send')).toContain('reconcile_lease_token');
		expect(tableNames(db).filter((name) => name === 'outbound_send')).toHaveLength(1);
	});

	it('is applied by the deployment workflow before the Worker is released', () => {
		expect(workflow).toContain('migrations/v3_16_send_lifecycle.sql');
		expect(workflow).toContain('migrations/v3_16_send_lifecycle_indexes.sql');
		expect(workflow.indexOf('migrations/v3_16_send_lifecycle.sql')).toBeLessThan(
			workflow.indexOf('开始部署 / Start deployment'),
		);

		for (const [table, column] of WORKFLOW_COLUMNS) {
			expect(workflow).toContain(`ensure_column ${table} ${column}`);
		}

		// The post-deploy verification must fail loudly if the schema is absent.
		for (const table of [
			'outbound_send',
			'outbound_send_snapshot',
			'outbound_send_attachment',
			'storage_cleanup',
			'resend_webhook_event',
		]) {
			expect(workflow).toContain(table);
		}
		expect(workflow).toContain("for column in body_type trashed trashed_at trash_archived send_operation_id");
	});
});
