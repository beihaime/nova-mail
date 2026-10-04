import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { REQUIRED_COLUMNS, checkSchema } from '../../scripts/schema-manifest.mjs';

/**
 * Guards the harness itself.
 *
 * If the schema bootstrap silently degrades (for example a future migration
 * starts throwing before the tables exist), every other suite would fail with
 * confusing errors. These assertions fail first and say why.
 */
describe('integration harness', () => {
	it('creates the schema through the worker init code', async () => {
		const { results } = await env.db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
			.all();
		const tables = results.map((row) => row.name);

		expect(tables).toContain('email');
		expect(tables).toContain('user');
		expect(tables).toContain('account');
		expect(tables).toContain('setting');
		expect(tables).toContain('push_subscription');
		expect(tables).toContain('auth_session');
		expect(tables).toContain('user_security_settings');
		expect(tables).toContain('outbound_send');
		expect(tables).toContain('storage_cleanup');
		expect(tables).toContain('resend_webhook_event');
	});

	it('applies the ALTER-based migrations, not just the base tables', async () => {
		const { results } = await env.db.prepare("SELECT name FROM pragma_table_info('email')").all();
		const columns = results.map((row) => row.name);

		// Added after the original CREATE TABLE, so their absence means the
		// migration pass did not run.
		expect(columns).toContain('body_type');
		expect(columns).toContain('thread_id');
		expect(columns).toContain('parent_message_id');
		// v3.10, behind the mobile swipe actions.
		expect(columns).toContain('archived');
		// v3.11, behind the Trash mailbox and every normal list filter.
		expect(columns).toContain('trashed');
		expect(columns).toContain('trashed_at');
		expect(columns).toContain('trash_archived');
		// v3.16: retry-safe outbound delivery records its durable operation id.
		expect(columns).toContain('send_operation_id');
	});

	it('binds a usable JWT secret and the test mail domain', async () => {
		expect(typeof env.jwt_secret).toBe('string');
		expect(env.jwt_secret.length).toBeGreaterThanOrEqual(32);
		expect(env.domain).toContain('example.com');
	});

	it('satisfies the required-schema manifest the deployment gate enforces', async () => {
		const [tables, indexes] = await Promise.all([
			env.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all(),
			env.db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all(),
		]);

		// D1 only authorizes `pragma_table_info` with a literal argument, so the
		// columns are read one required table at a time.
		const columns = [];
		for (const table of Object.keys(REQUIRED_COLUMNS)) {
			const { results } = await env.db
				.prepare(`SELECT name FROM pragma_table_info('${table}')`)
				.all();
			for (const row of results) columns.push(`${table}.${row.name}`);
		}

		const result = checkSchema({
			tables: tables.results.map((row) => row.name),
			indexes: indexes.results.map((row) => row.name),
			columns,
			invariants: { noncanonical_user: 0, noncanonical_account: 0 },
		});

		// A fresh bootstrap is the reference for what the current Worker needs, so
		// a drift between src/init/init.js and the deployment manifest fails here.
		expect(result).toEqual({ ok: true, missing: [], violations: [] });
	});
});
