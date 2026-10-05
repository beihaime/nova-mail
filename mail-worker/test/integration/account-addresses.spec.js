import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { api, createAccount, createAdmin, json, sessionFor, uniqueEmail } from './helpers';

/**
 * Account addresses, end to end: the request path the Settings → Account
 * addresses page uses (`/account/add`, `/account/list`, and every row action),
 * plus the ownership boundary between two ordinary users and the administrator
 * view.
 *
 * Two regressions are guarded here:
 *   * a released Worker queried `email.send_operation_id` / `outbound_send`
 *     against a database that the deployment workflow never migrated, so every
 *     request answered 502 — these tests run against the fully migrated schema;
 *   * address row actions accepted an id supplied by the client without proving
 *     it belonged to the caller, so a foreign id answered success (and, for
 *     delete, disclosed that the row existed).
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

	it('lists only the addresses owned by the authenticated user', async () => {
		const alice = await sessionFor(await createAccount());
		const bob = await sessionFor(await createAccount());
		const aliceAlias = uniqueEmail('alice-only');
		const bobAlias = uniqueEmail('bob-only');

		await api('/api/account/add', { token: alice.token, method: 'POST', body: { email: aliceAlias } });
		await api('/api/account/add', { token: bob.token, method: 'POST', body: { email: bobAlias } });

		const aliceList = await json(await api('/api/account/list', { token: alice.token }));
		const bobList = await json(await api('/api/account/list', { token: bob.token }));

		const aliceEmails = aliceList.data.map((row) => row.email);
		const bobEmails = bobList.data.map((row) => row.email);

		expect(aliceEmails).toContain(alice.email);
		expect(aliceEmails).toContain(aliceAlias);
		expect(aliceEmails).not.toContain(bob.email);
		expect(aliceEmails).not.toContain(bobAlias);

		expect(bobEmails).toContain(bob.email);
		expect(bobEmails).toContain(bobAlias);
		expect(bobEmails).not.toContain(alice.email);
		expect(bobEmails).not.toContain(aliceAlias);

		// Every returned row belongs to the caller, even when pagination params
		// are supplied by the client.
		const foreignPage = await json(
			await api(`/api/account/list?accountId=${bob.accountId}&lastSort=9999999999`, { token: alice.token }),
		);
		expect(foreignPage.data.every((row) => row.userId === alice.userId)).toBe(true);

		// Alice cannot claim an address that already belongs to Bob.
		const claim = await json(
			await api('/api/account/add', { token: alice.token, method: 'POST', body: { email: bobAlias } }),
		);
		expect(claim.code).not.toBe(200);

		const owner = await env.db
			.prepare('SELECT user_id FROM account WHERE email = ?')
			.bind(bobAlias)
			.first();
		expect(owner.user_id).toBe(bob.userId);
	});

	it('answers 404 for another user’s address on every mutation and changes nothing', async () => {
		const alice = await sessionFor(await createAccount());
		const bob = await sessionFor(await createAccount());
		const address = uniqueEmail('bob-alias');

		const owned = await json(
			await api('/api/account/add', { token: bob.token, method: 'POST', body: { email: address } }),
		);
		expect(owned.code).toBe(200);
		const accountId = owned.data.accountId;

		const setName = await json(await api('/api/account/setName', {
			token: alice.token,
			method: 'PUT',
			body: { accountId, name: 'hijacked-by-alice' },
		}));
		const setAllReceive = await json(await api('/api/account/setAllReceive', {
			token: alice.token,
			method: 'PUT',
			body: { accountId },
		}));
		const setAsTop = await json(await api('/api/account/setAsTop', {
			token: alice.token,
			method: 'PUT',
			body: { accountId },
		}));
		const deleted = await json(await api(`/api/account/delete?accountId=${accountId}`, {
			token: alice.token,
			method: 'DELETE',
		}));

		// A foreign id is indistinguishable from an unknown one.
		for (const response of [setName, setAllReceive, setAsTop, deleted]) {
			expect(response.code).toBe(404);
		}

		const row = await env.db
			.prepare('SELECT name, is_del, all_receive FROM account WHERE account_id = ?')
			.bind(accountId)
			.first();
		expect(row.name).not.toBe('hijacked-by-alice');
		expect(row.is_del).toBe(0);
		expect(row.all_receive).toBe(0);

		// An id that never existed is also a 404, never a 500.
		const unknown = await json(await api('/api/account/setName', {
			token: alice.token,
			method: 'PUT',
			body: { accountId: 999999, name: 'x' },
		}));
		expect(unknown.code).toBe(404);
	});

	it('never lets one user read another user’s mailbox through an account id', async () => {
		const alice = await sessionFor(await createAccount());
		const bob = await sessionFor(await createAccount());

		const list = await json(
			await api(`/api/email/list?accountId=${bob.accountId}&type=0`, { token: alice.token }),
		);
		expect(list.code).toBe(404);

		const latest = await json(
			await api(`/api/email/latest?emailId=0&accountId=${bob.accountId}`, { token: alice.token }),
		);
		expect(latest.code).toBe(404);
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

	it('lets an administrator read every user’s addresses, and only an administrator', async () => {
		const alice = await sessionFor(await createAccount());
		const bob = await sessionFor(await createAccount());
		const admin = await sessionFor(await createAdmin());
		const address = uniqueEmail('bob-managed');
		await api('/api/account/add', { token: bob.token, method: 'POST', body: { email: address } });

		const adminView = await json(
			await api(`/api/user/allAccount?userId=${bob.userId}`, { token: admin.token }),
		);
		expect(adminView.code).toBe(200);
		expect(adminView.data.list.map((row) => row.email)).toContain(address);
		expect(adminView.data.list.every((row) => row.userId === bob.userId)).toBe(true);

		// A normal user is refused even though the route returns addresses.
		const userView = await json(
			await api(`/api/user/allAccount?userId=${bob.userId}`, { token: alice.token }),
		);
		expect(userView.code).toBe(403);

		// Deleting another user's address is administrator-only too.
		const bobAccountId = adminView.data.list.find((row) => row.email === address).accountId;
		const userDelete = await json(
			await api(`/api/user/deleteAccount?accountId=${bobAccountId}`, { token: alice.token, method: 'DELETE' }),
		);
		expect(userDelete.code).toBe(403);

		const stillThere = await env.db
			.prepare('SELECT is_del FROM account WHERE account_id = ?')
			.bind(bobAccountId)
			.first();
		expect(stillThere).not.toBeNull();
	});

	it('rejects unauthenticated address requests with 401 and never caches them', async () => {
		const anonymousList = await json(await api('/api/account/list'));
		expect(anonymousList.code).toBe(401);
		const anonymousDelete = await json(await api('/api/account/delete?accountId=1', { method: 'DELETE' }));
		expect(anonymousDelete.code).toBe(401);

		const alice = await sessionFor(await createAccount());
		const response = await api('/api/account/list', { token: alice.token });
		// A shared cache must never be able to replay one user's addresses.
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect((await response.json()).code).toBe(200);
	});
});
