import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';

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
	});

	it('applies the ALTER-based migrations, not just the base tables', async () => {
		const { results } = await env.db.prepare("SELECT name FROM pragma_table_info('email')").all();
		const columns = results.map((row) => row.name);

		// Added after the original CREATE TABLE, so their absence means the
		// migration pass did not run.
		expect(columns).toContain('body_type');
		expect(columns).toContain('thread_id');
		expect(columns).toContain('parent_message_id');
	});

	it('binds a usable JWT secret and the test mail domain', async () => {
		expect(typeof env.jwt_secret).toBe('string');
		expect(env.jwt_secret.length).toBeGreaterThanOrEqual(32);
		expect(env.domain).toContain('example.com');
	});
});
