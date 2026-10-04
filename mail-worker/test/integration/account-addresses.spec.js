import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { api, createAccount, json, sessionFor, uniqueEmail } from './helpers';

/**
 * Account addresses, end to end: the request path the Settings → Account
 * addresses page uses (`/account/add`, `/account/list`, and every row action),
 * plus the ownership boundary between two ordinary users.
 *
 * The production regression this guards was a *schema* one — a released Worker
 * queried `email.send_operation_id` / `outbound_send` against a database that
 * the deployment workflow never migrated, so every request answered 502. These
 * tests run against the fully migrated schema and must keep passing.
 */
describe('account addresses', () => {
	it('adds an address, persists it, and rejects a duplicate', async () => {
		const alice = await sessionFor(await createAccount());
		const address = uniqueEmail('alias');

		const added = await json(
			await api('/api/account/add', { token: alice.token, method: 'POST', body: { email: address } }),
		);
		expect(added.code).toBe(200);
		expect(added.data.email).toBe(address);

		// Persisted: a later list (the page's refresh path) returns it.
		const list = await json(await api('/api/account/list', { token: alice.token }));
		expect(list.code).toBe(200);
		expect(list.data.map((row) => row.email)).toContain(address);

		// Duplicate address is rejected and does not create a second row.
		const duplicate = await json(
			await api('/api/account/add', { token: alice.token, method: 'POST', body: { email: address } }),
		);
		expect(duplicate.code).not.toBe(200);

		const { count } = await env.db
			.prepare('SELECT count(*) AS count FROM account WHERE email = ?')
			.bind(address)
			.first();
		expect(count).toBe(1);
	});

	it('rejects an address on a domain the deployment does not serve', async () => {
		const alice = await sessionFor(await createAccount());

		const response = await json(
			await api('/api/account/add', {
				token: alice.token,
				method: 'POST',
				body: { email: 'intruder@not-configured.example' },
			}),
		);
		expect(response.code).not.toBe(200);
	});

	it('never lets one user read or modify another user’s addresses', async () => {
		const alice = await sessionFor(await createAccount());
		const bob = await sessionFor(await createAccount());
		const address = uniqueEmail('bob-alias');

		const owned = await json(
			await api('/api/account/add', { token: bob.token, method: 'POST', body: { email: address } }),
		);
		expect(owned.code).toBe(200);
		const accountId = owned.data.accountId;

		// Alice's list stays scoped to her own rows.
		const aliceList = await json(await api('/api/account/list', { token: alice.token }));
		expect(aliceList.data.map((row) => row.email)).not.toContain(address);

		// Every row action is a no-op for a foreign account id.
		await api('/api/account/setName', {
			token: alice.token,
			method: 'PUT',
			body: { accountId, name: 'hijacked-by-alice' },
		});
		await api('/api/account/setAllReceive', {
			token: alice.token,
			method: 'PUT',
			body: { accountId },
		});
		await api('/api/account/setAsTop', {
			token: alice.token,
			method: 'PUT',
			body: { accountId },
		});
		await api(`/api/account/delete?accountId=${accountId}`, { token: alice.token, method: 'DELETE' });

		const row = await env.db
			.prepare('SELECT name, is_del, all_receive FROM account WHERE account_id = ?')
			.bind(accountId)
			.first();
		expect(row.name).not.toBe('hijacked-by-alice');
		expect(row.is_del).toBe(0);
	});

	it('keeps the primary address as the user’s own address', async () => {
		const alice = await sessionFor(await createAccount());
		const address = uniqueEmail('secondary');
		await api('/api/account/add', { token: alice.token, method: 'POST', body: { email: address } });

		const primary = await env.db
			.prepare('SELECT email FROM account WHERE user_id = ? AND is_del = 0 ORDER BY account_id LIMIT 1')
			.bind(alice.userId)
			.first();

		// The first (oldest) account is the primary row; adding an alias never
		// changes the user's own address.
		expect(primary.email).toBe(alice.email);
	});
});
