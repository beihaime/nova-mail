import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkSchema, REQUIRED_COLUMNS } from '../scripts/schema-manifest.mjs';
import { verifyDeployedSchema } from '../scripts/verify-schema.mjs';

/**
 * End-to-end guard for the *existing-installation* migration path.
 *
 * `dbInit.init()` is only reachable from the one-time `/api/bootstrap` route,
 * which answers 409 for an initialized database. Everything a released Worker
 * needs therefore has to be applied by the deployment workflow. This test takes
 * a legacy schema, applies exactly the SQL files and guarded `ADD COLUMN`
 * statements the workflow applies, and asserts the deployment schema gate
 * (`scripts/verify-schema.sh` → `scripts/check-schema.mjs`) passes.
 *
 * A migration the workflow forgot therefore fails here even though
 * `dbInit.init()` knows about it.
 */

const read = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');

const v3_4_v3_7 = read('v3_4_v3_7_tables.sql');
const v3_12 = read('v3_12_email_identity.sql');
const v3_13 = read('v3_13_sessions.sql');
const v3_14 = read('v3_14_user_preferences.sql');
const v3_16 = read('v3_16_send_lifecycle.sql');
const v3_16_indexes = read('v3_16_send_lifecycle_indexes.sql');

// The guarded ALTERs the workflow runs, in workflow order. Columns belonging to
// a table created by a migration are added only after that migration ran.
const PRE_TABLE_COLUMNS = [
	['email', 'body_type', "TEXT NOT NULL DEFAULT ''"],
	['email', 'thread_id', "TEXT NOT NULL DEFAULT ''"],
	['email', 'parent_message_id', 'INTEGER NOT NULL DEFAULT 0'],
	['email', 'bimi_selector', "TEXT NOT NULL DEFAULT ''"],
	['email', 'auth_results', "TEXT NOT NULL DEFAULT ''"],
	['email', 'archived', 'INTEGER NOT NULL DEFAULT 0'],
	['email', 'trashed', 'INTEGER NOT NULL DEFAULT 0'],
	['email', 'trashed_at', "TEXT NOT NULL DEFAULT ''"],
	['email', 'trash_archived', 'INTEGER NOT NULL DEFAULT 0'],
	['user', 'reg_key_id', 'INTEGER NOT NULL DEFAULT 0'],
	['account', 'all_receive', 'INTEGER NOT NULL DEFAULT 0'],
	['account', 'sort', 'INTEGER NOT NULL DEFAULT 0'],
];

const SEND_COLUMNS = [
	['email', 'send_operation_id', "TEXT NOT NULL DEFAULT ''"],
	['attachments', 'send_operation_id', "TEXT NOT NULL DEFAULT ''"],
	['attachments', 'send_ordinal', 'INTEGER NOT NULL DEFAULT -1'],
];

const POST_TABLE_COLUMNS = [
	['outbound_send', 'reconcile_lease_until', 'INTEGER NOT NULL DEFAULT 0'],
	['outbound_send', 'reconcile_lease_token', "TEXT NOT NULL DEFAULT ''"],
	['resend_webhook_event', 'status', "TEXT NOT NULL DEFAULT 'received'"],
	['resend_webhook_event', 'processing_until', 'INTEGER NOT NULL DEFAULT 0'],
	['resend_webhook_event', 'applied_at', 'INTEGER'],
];

const workflow = readFileSync(
	new URL('../../.github/workflows/deploy-cloudflare.yml', import.meta.url),
	'utf8',
);

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
		CREATE TABLE user (user_id INTEGER PRIMARY KEY, email TEXT NOT NULL, is_del INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE account (account_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, email TEXT NOT NULL, is_del INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE email (email_id INTEGER PRIMARY KEY, user_id INTEGER, account_id INTEGER, send_email TEXT, to_email TEXT, message_id TEXT NOT NULL DEFAULT '', type INTEGER, is_del INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE attachments (att_id INTEGER PRIMARY KEY, user_id INTEGER, account_id INTEGER, email_id INTEGER, type INTEGER);
		CREATE TABLE star (star_id INTEGER PRIMARY KEY, user_id INTEGER, email_id INTEGER);
		CREATE TABLE oauth (oauth_id INTEGER PRIMARY KEY, user_id INTEGER);
		CREATE TABLE setting (setting_id INTEGER PRIMARY KEY);

		-- An existing installation with a non-canonical identity.
		INSERT INTO user (user_id, email) VALUES (1, 'Dev@beihaime.com');
		INSERT INTO account (account_id, user_id, email) VALUES (1, 1, 'Dev@beihaime.com');
		INSERT INTO email (email_id, user_id, account_id, send_email, to_email) VALUES (1, 1, 1, 'Dev@beihaime.com', 'Friend@Example.com');
	`);
	return db;
}

function ensureColumns(db, list) {
	for (const [table, column, definition] of list) {
		const present = db
			.prepare(`SELECT name FROM pragma_table_info('${table}')`)
			.all()
			.some((row) => row.name === column);
		if (!present) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
	}
}

function applyExistingInstallPath(db) {
	ensureColumns(db, PRE_TABLE_COLUMNS);

	db.exec('CREATE INDEX IF NOT EXISTS idx_email_user_trashed ON email(user_id, trashed, account_id);');
	db.exec(v3_4_v3_7);
	db.exec(v3_12);
	db.exec(v3_13);
	db.exec(v3_14);

	// v3.15 — mailbox-scoped Message-ID uniqueness. The workflow computes a
	// legacy cutoff first; this fixture has no duplicate rows.
	db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_email_mailbox_message_id_unique ON email(user_id, account_id, lower(trim(message_id, '<> '))) WHERE trim(message_id, '<> ') != ''");

	ensureColumns(db, SEND_COLUMNS);
	db.exec(v3_16);
	ensureColumns(db, POST_TABLE_COLUMNS);
	db.exec(v3_16_indexes);
}

function deployedSchema(db) {
	const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
	const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((r) => r.name);
	const columns = [];
	for (const table of Object.keys(REQUIRED_COLUMNS)) {
		for (const row of db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all()) {
			columns.push(`${table}.${row.name}`);
		}
	}
	const invariants = db.prepare(`
		SELECT (SELECT count(*) FROM user WHERE email != lower(trim(email))) AS noncanonical_user,
		       (SELECT count(*) FROM account WHERE email != lower(trim(email))) AS noncanonical_account
	`).get();
	return { tables, indexes, columns, invariants };
}

describeSqlite('existing-installation schema path', () => {
	it('reaches the schema the deployment gate requires', () => {
		const db = legacyDatabase();
		applyExistingInstallPath(db);

		const result = checkSchema(deployedSchema(db));
		expect(result).toEqual({ ok: true, missing: [], violations: [] });
	});

	it('canonicalizes the legacy identity as part of the chain', () => {
		const db = legacyDatabase();
		applyExistingInstallPath(db);
		expect(db.prepare('SELECT email FROM user WHERE user_id = 1').get()).toEqual({ email: 'dev@beihaime.com' });
		expect(db.prepare('SELECT email FROM account WHERE account_id = 1').get()).toEqual({ email: 'dev@beihaime.com' });
		expect(db.prepare('SELECT send_email, to_email FROM email WHERE email_id = 1').get()).toEqual({
			send_email: 'dev@beihaime.com',
			to_email: 'friend@example.com',
		});
	});

	it('is idempotent when the whole chain runs twice', () => {
		const db = legacyDatabase();
		applyExistingInstallPath(db);
		const first = deployedSchema(db);
		applyExistingInstallPath(db);
		expect(deployedSchema(db)).toEqual(first);
	});

	it('is verified by the deployment verifier against a real SQLite engine', async () => {
		const db = legacyDatabase();
		applyExistingInstallPath(db);

		// The verifier's exact SQL strings, run against real SQLite (the same
		// engine family D1 exposes), including the per-table literal
		// `pragma_table_info` queries and the identity-invariant query.
		const execute = (sql) => ({
			status: 0,
			stdout: JSON.stringify([{ results: db.prepare(sql).all(), success: true }]),
		});

		const result = await verifyDeployedSchema({ execute, log: () => {}, errorLog: () => {} });
		expect(result).toEqual({ ok: true, missing: [], violations: [] });
	});

	it('applies every guarded column the workflow declares', () => {
		for (const [table, column] of [...PRE_TABLE_COLUMNS, ...SEND_COLUMNS, ...POST_TABLE_COLUMNS]) {
			expect(workflow).toContain(`ensure_column ${table} ${column}`);
		}
	});
});
