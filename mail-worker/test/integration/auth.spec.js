import { beforeAll, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import jwtUtils from '../../src/utils/jwt-utils';
import KvConst from '../../src/const/kv-const';
import { api, context, createAccount, createAdmin, sessionFor, openSend } from './helpers';

/**
 * Critical path: sign-in and permission denial.
 *
 * The middleware is the single gate in front of every mailbox route, so these
 * tests drive it through the real HTTP stack (`SELF.fetch`) rather than calling
 * it directly — that is what makes a regression in route ordering, public-route
 * matching or the permission table fail the build.
 */
describe('API authentication', () => {
	it('rejects a mailbox request with no token', async () => {
		const response = await api('/api/email/list?accountId=1&type=0&size=10');
		const body = await response.json();
		expect(body.code).toBe(401);
	});

	it('rejects a syntactically invalid token', async () => {
		const response = await api('/api/email/list?accountId=1&type=0&size=10', { token: 'not.a.jwt' });
		expect((await response.json()).code).toBe(401);
	});

	it('rejects a well-formed token with no server-side session', async () => {
		// Signature is valid, but `token` was never registered in KV by a login.
		const forged = await jwtUtils.generateToken(context(), { userId: 99999, token: 'never-issued' }, 3600);
		const response = await api('/api/email/list?accountId=1&type=0&size=10', { token: forged });
		expect((await response.json()).code).toBe(401);
	});

	it('rejects a session whose KV record was revoked', async () => {
		const principal = await sessionFor(await createAccount());
		const authInfo = await env.kv.get(KvConst.AUTH_INFO + principal.userId, { type: 'json' });
		authInfo.tokens = [];
		await env.kv.put(KvConst.AUTH_INFO + principal.userId, JSON.stringify(authInfo));

		const response = await api('/api/email/list?accountId=1&type=0&size=10', { token: principal.token });
		expect((await response.json()).code).toBe(401);
	});

	it('accepts a real session and scopes the list to the caller', async () => {
		const principal = await sessionFor(await createAccount());
		const response = await api(`/api/email/list?accountId=${principal.accountId}&type=0&size=10`, {
			token: principal.token,
		});
		const body = await response.json();

		expect(body.code).toBe(200);
		expect(Array.isArray(body.data.list)).toBe(true);
	});
});

describe('permission enforcement', () => {
	beforeAll(async () => {
		await openSend();
	});

	it('refuses a management route to a user without the permission', async () => {
		const principal = await sessionFor(await createAccount());
		const response = await api('/api/allEmail/list?size=10', { token: principal.token });

		// `all-email:query` is not part of the default role.
		expect((await response.json()).code).toBe(403);
	});

	it('lets the configured administrator through the same route', async () => {
		const admin = await sessionFor(await createAdmin());
		const response = await api('/api/allEmail/list?size=10', { token: admin.token });

		expect((await response.json()).code).toBe(200);
	});

	it('refuses to send mail for a role whose sending is banned', async () => {
		const sender = await sessionFor(await createAccount());

		const response = await api('/api/email/send', {
			method: 'POST',
			token: sender.token,
			body: {
				accountId: sender.accountId,
				receiveEmail: ['someone@example.com'],
				subject: 'Blocked',
				content: '<p>hi</p>',
				text: 'hi',
				sendType: '',
				attachments: [],
			},
		});

		// The default seeded role uses send_type = 'ban'.
		expect((await response.json()).code).toBe(403);
	});

	it('never serves a private attachment route anonymously', async () => {
		const response = await api('/api/attachments/1');
		expect((await response.json()).code).toBe(401);
	});
});
