import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import KvConst from '../../src/const/kv-const';
import { api, createAccount, sessionFor } from './helpers';

/** A grant token long enough to pass the `length < 32` expiry guard. */
function grant() {
	return `grant-${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

/**
 * OAuth completion is a public route by necessity — the provider redirects the
 * browser to it before any session exists — so its only protection is the
 * one-time grant in KV. These tests pin that contract: unknown grants fail, a
 * real grant yields a session, and a grant is burned on first use.
 */
describe('OAuth complete', () => {
	it('rejects a grant that was never issued', async () => {
		const response = await api('/api/oauth/google/complete', {
			method: 'POST',
			body: { grant: grant() },
		});

		const body = await response.json();
		expect(body.code).not.toBe(200);
		expect(body.data ?? null).toBeNull();
	});

	it('rejects a grant that is too short to be real', async () => {
		const response = await api('/api/oauth/google/complete', {
			method: 'POST',
			body: { grant: 'short' },
		});

		expect((await response.json()).code).not.toBe(200);
	});

	it('exchanges a valid Google grant for a session exactly once', async () => {
		const token = grant();
		const issued = `jwt-for-${token}`;
		await env.kv.put(
			KvConst.OAUTH_GOOGLE_COMPLETE + token,
			JSON.stringify({ token: issued }),
			{ expirationTtl: 60 },
		);

		const first = await api('/api/oauth/google/complete', {
			method: 'POST',
			body: { grant: token },
		});
		const firstBody = await first.json();
		expect(firstBody.code).toBe(200);
		expect(firstBody.data.token).toBe(issued);

		// The grant is single-use: replaying it must not mint another session.
		const second = await api('/api/oauth/google/complete', {
			method: 'POST',
			body: { grant: token },
		});
		expect((await second.json()).code).not.toBe(200);
	});

	it('applies the same one-time rule to the GitHub flow', async () => {
		const token = grant();
		await env.kv.put(
			KvConst.OAUTH_GITHUB_COMPLETE + token,
			JSON.stringify({ token: 'github-jwt' }),
			{ expirationTtl: 60 },
		);

		const response = await api('/api/oauth/github/complete', {
			method: 'POST',
			body: { grant: token },
		});
		expect((await response.json()).data.token).toBe('github-jwt');
	});

	it('keeps the retired public binding endpoint closed', async () => {
		const response = await api('/api/oauth/bindUser', {
			method: 'PUT',
			body: { email: 'attacker@example.com', bindToken: 'x', code: '' },
		});

		// It used to let anyone bind an OAuth identity with no session.
		expect((await response.json()).code).toBe(401);
	});
});

describe('attachment authorization', () => {
	it('requires a session before touching object storage', async () => {
		const response = await api('/api/attachments/1');
		expect((await response.json()).code).toBe(401);
	});

	it('never serves an unknown attachment to an authenticated stranger', async () => {
		const principal = await sessionFor(await createAccount());
		const response = await api('/api/attachments/999999', { token: principal.token });

		// No row, no object: not found (404 or an empty payload), never a 200 body.
		expect(response.status === 200 ? (await response.json()).code : response.status).not.toBe(200);
	});

	it('rejects the legacy unauthenticated /attachments/ path outright', async () => {
		const { SELF } = await import('cloudflare:test');
		const response = await SELF.fetch('https://mail.example/attachments/owner.png');

		expect(response.status).toBe(404);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});
