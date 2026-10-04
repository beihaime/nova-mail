import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Guards the *existing-installation* email-identity migration.
 *
 * `dbInit.v3_12DB` (src/init/init.js) canonicalizes mailbox identities on a
 * fresh database, but an initialized D1 can never bootstrap again, so the same
 * work must exist as a forward-only, idempotent SQL migration. This test applies
 * that file to a synthetic legacy database that still carries the original
 * case-sensitive unique indexes and mixed-case / padded addresses, and proves:
 *
 *   - `Dev@…` and `dev@…` collapse into one canonical `dev@…` identity;
 *   - no message, attachment, star, subscription or OAuth link is lost;
 *   - a second run is a no-op.
 */

const migrationSql = readFileSync(
	new URL('../migrations/v3_12_email_identity.sql', import.meta.url),
	'utf8',
);
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
		CREATE TABLE email (email_id INTEGER PRIMARY KEY, user_id INTEGER, account_id INTEGER, send_email TEXT, to_email TEXT, is_del INTEGER NOT NULL DEFAULT 0);
		CREATE TABLE attachments (att_id INTEGER PRIMARY KEY, user_id INTEGER, account_id INTEGER, email_id INTEGER);
		CREATE TABLE star (star_id INTEGER PRIMARY KEY, user_id INTEGER, email_id INTEGER);
		CREATE TABLE push_subscription (id INTEGER PRIMARY KEY, user_id INTEGER);
		CREATE TABLE oauth_accounts (oauth_account_id INTEGER PRIMARY KEY, user_id INTEGER);
		CREATE TABLE oauth (oauth_id INTEGER PRIMARY KEY, user_id INTEGER);

		-- The original, case-sensitive unique keys.
		CREATE UNIQUE INDEX idx_user_email ON user(email);
		CREATE UNIQUE INDEX idx_account_email ON account(email);
	`);

	// Two rows that differ only by case, plus one padded mixed-case address.
	db.exec(`
		INSERT INTO user (user_id, email, is_del) VALUES
			(1, 'Dev@beihaime.com', 0),
			(2, 'dev@beihaime.com', 0),
			(3, '  Solo@beihaime.com  ', 0);
		INSERT INTO account (account_id, user_id, email, is_del) VALUES
			(1, 1, 'Dev@beihaime.com', 0),
			(2, 2, 'dev@beihaime.com', 0),
			(3, 3, '  Solo@beihaime.com  ', 0);
		INSERT INTO email (email_id, user_id, account_id, send_email, to_email) VALUES
			(1, 2, 2, 'Dev@beihaime.com', 'Friend@Example.com'),
			(2, 3, 3, '  Solo@beihaime.com  ', 'other@example.com');
		INSERT INTO attachments (att_id, user_id, account_id, email_id) VALUES (1, 2, 2, 1);
		INSERT INTO star (star_id, user_id, email_id) VALUES (1, 2, 1);
		INSERT INTO push_subscription (id, user_id) VALUES (1, 2);
		INSERT INTO oauth_accounts (oauth_account_id, user_id) VALUES (1, 2);
		INSERT INTO oauth (oauth_id, user_id) VALUES (1, 2);
	`);
	return db;
}

const all = (db, sql) => db.prepare(sql).all();
const indexNames = (db) => all(db, "SELECT name FROM sqlite_master WHERE type = 'index'").map((row) => row.name);

function snapshot(db) {
	return {
		user: all(db, 'SELECT user_id, email, is_del FROM user ORDER BY user_id'),
		account: all(db, 'SELECT account_id, user_id, email, is_del FROM account ORDER BY account_id'),
		email: all(db, 'SELECT email_id, user_id, account_id, send_email, to_email FROM email ORDER BY email_id'),
		attachments: all(db, 'SELECT att_id, user_id, account_id, email_id FROM attachments ORDER BY att_id'),
		star: all(db, 'SELECT star_id, user_id, email_id FROM star ORDER BY star_id'),
		push: all(db, 'SELECT id, user_id FROM push_subscription ORDER BY id'),
		oauthAccounts: all(db, 'SELECT oauth_account_id, user_id FROM oauth_accounts ORDER BY oauth_account_id'),
		oauth: all(db, 'SELECT oauth_id, user_id FROM oauth ORDER BY oauth_id'),
		indexes: indexNames(db).sort(),
	};
}

describeSqlite('existing-installation email identity migration', () => {
	it('canonicalizes identities, merges duplicates and preserves every message', () => {
		const db = legacyDatabase();
		db.exec(migrationSql);

		expect(all(db, 'SELECT user_id, email FROM user ORDER BY user_id')).toEqual([
			{ user_id: 1, email: 'dev@beihaime.com' },
			{ user_id: 3, email: 'solo@beihaime.com' },
		]);

		expect(all(db, 'SELECT account_id, user_id, email FROM account ORDER BY account_id')).toEqual([
			{ account_id: 1, user_id: 1, email: 'dev@beihaime.com' },
			{ account_id: 3, user_id: 3, email: 'solo@beihaime.com' },
		]);

		// No message is deleted; the duplicate mailbox's mail now belongs to the
		// surviving account and every stored address is canonical.
		expect(all(db, 'SELECT email_id, user_id, account_id, send_email, to_email FROM email ORDER BY email_id')).toEqual([
			{ email_id: 1, user_id: 1, account_id: 1, send_email: 'dev@beihaime.com', to_email: 'friend@example.com' },
			{ email_id: 2, user_id: 3, account_id: 3, send_email: 'solo@beihaime.com', to_email: 'other@example.com' },
		]);

		// Dependent rows follow the surviving user.
		expect(all(db, 'SELECT user_id FROM attachments')).toEqual([{ user_id: 1 }]);
		expect(all(db, 'SELECT user_id FROM star')).toEqual([{ user_id: 1 }]);
		expect(all(db, 'SELECT user_id FROM push_subscription')).toEqual([{ user_id: 1 }]);
		expect(all(db, 'SELECT user_id FROM oauth_accounts')).toEqual([{ user_id: 1 }]);
		expect(all(db, 'SELECT user_id FROM oauth')).toEqual([{ user_id: 1 }]);

		expect(indexNames(db)).toEqual(
			expect.arrayContaining(['idx_user_email_nocase', 'idx_account_email_nocase']),
		);
		expect(indexNames(db)).not.toEqual(
			expect.arrayContaining(['idx_user_email', 'idx_account_email']),
		);
	});

	it('is idempotent when applied a second time', () => {
		const db = legacyDatabase();
		db.exec(migrationSql);
		const afterFirstRun = snapshot(db);

		db.exec(migrationSql);
		expect(snapshot(db)).toEqual(afterFirstRun);
	});

	it('leaves an already-canonical database untouched', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(`
			CREATE TABLE user (user_id INTEGER PRIMARY KEY, email TEXT NOT NULL, is_del INTEGER NOT NULL DEFAULT 0);
			CREATE TABLE account (account_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, email TEXT NOT NULL, is_del INTEGER NOT NULL DEFAULT 0);
			CREATE TABLE email (email_id INTEGER PRIMARY KEY, user_id INTEGER, account_id INTEGER, send_email TEXT, to_email TEXT, is_del INTEGER NOT NULL DEFAULT 0);
			CREATE TABLE attachments (att_id INTEGER PRIMARY KEY, user_id INTEGER, account_id INTEGER, email_id INTEGER);
			CREATE TABLE star (star_id INTEGER PRIMARY KEY, user_id INTEGER, email_id INTEGER);
			CREATE TABLE push_subscription (id INTEGER PRIMARY KEY, user_id INTEGER);
			CREATE TABLE oauth_accounts (oauth_account_id INTEGER PRIMARY KEY, user_id INTEGER);
			CREATE TABLE oauth (oauth_id INTEGER PRIMARY KEY, user_id INTEGER);
			INSERT INTO user (user_id, email) VALUES (1, 'dev@beihaime.com');
			INSERT INTO account (account_id, user_id, email) VALUES (1, 1, 'dev@beihaime.com');
			INSERT INTO email (email_id, user_id, account_id, send_email, to_email) VALUES (1, 1, 1, 'dev@beihaime.com', 'friend@example.com');
		`);
		const before = snapshot(db);
		db.exec(migrationSql);
		const after = snapshot(db);
		expect(after.user).toEqual(before.user);
		expect(after.account).toEqual(before.account);
		expect(after.email).toEqual(before.email);
	});
});

describe('email identity migration wiring', () => {
	it('is applied by the deployment workflow before the Worker is released', () => {
		expect(workflow).toContain('migrations/v3_12_email_identity.sql');
		expect(workflow.indexOf('migrations/v3_12_email_identity.sql')).toBeLessThan(
			workflow.indexOf('开始部署 / Start deployment'),
		);
		// The post-deploy verification must fail loudly if identities are still
		// not canonical.
		expect(workflow).toContain('Non-canonical mailbox identities remain in the deployed D1.');
		expect(workflow).toContain('idx_user_email_nocase');
		expect(workflow).toContain('idx_account_email_nocase');
	});
});
