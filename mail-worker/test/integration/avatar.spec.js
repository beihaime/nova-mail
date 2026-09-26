import { beforeAll, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { api, createAccount, seedEmail, sessionFor } from './helpers';

/** List the principal's Inbox rows. */
async function list(principal, size = 10) {
	const response = await api(
		`/api/email/list?accountId=${principal.accountId}&type=0&size=${size}`,
		{ token: principal.token },
	);
	return response.json();
}

describe('sender avatar routes', () => {
	let principal;

	beforeAll(async () => {
		principal = await sessionFor(await createAccount());
	});

	it('requires a session for the metadata endpoint', async () => {
		const response = await api('/api/avatar?email=user@example.com');
		expect((await response.json()).code).toBe(401);
	});

	it('returns the initial avatar for an unusable address without any lookup', async () => {
		const response = await api(`/api/avatar?email=${encodeURIComponent('not-an-address')}`, { token: principal.token });
		const body = await response.json();

		expect(body.code).toBe(200);
		expect(body.data).toEqual({ url: null, source: 'initial', verified: false, initials: 'N' });
	});

	it('serves only capability-signed image ids, and serves them publicly', async () => {
		const unsigned = await api('/api/avatar/image?id=abc');
		expect(unsigned.status).toBe(404);

		// A forged descriptor pointing at the cloud metadata address must never be
		// accepted, even though the route itself is public.
		const forged = btoa(JSON.stringify({ s: 'domain', d: '169.254.169.254' }))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=+$/, '');
		const response = await api(`/api/avatar/image?id=${encodeURIComponent(`${forged}.nope`)}`);
		expect(response.status).toBe(404);
	});

	it('attaches a well-formed avatar to every list row', async () => {
		await seedEmail(principal, { subject: 'avatar-row' });
		const body = await list(principal);

		const row = body.data.list.find(item => item.subject === 'avatar-row');
		expect(row.avatar).toBeTruthy();
		expect(['local', 'bimi', 'gravatar', 'domain', 'initial']).toContain(row.avatar.source);
		expect(typeof row.avatar.verified).toBe('boolean');
		expect(row.avatar).toHaveProperty('url');
	});

	it('keeps the internal BIMI selector and authentication results out of the response', async () => {
		const seeded = await seedEmail(principal, { subject: 'private-headers' });
		await env.db
			.prepare('UPDATE email SET bimi_selector = ?, auth_results = ? WHERE email_id = ?')
			.bind('brand', '{"source":"trusted-ingress","dmarc":"pass"}', seeded.email_id)
			.run();

		const body = await list(principal);
		const row = body.data.list.find(item => item.subject === 'private-headers');
		expect(row).toBeTruthy();
		expect(row.bimiSelector).toBeUndefined();
		expect(row.authResults).toBeUndefined();
	});

	it('uses the saved local avatar for a message from a Nova Mail address', async () => {
		await env.db
			.prepare(
				'INSERT INTO oauth (oauth_user_id, username, name, avatar, user_id, platform) VALUES (?, ?, ?, ?, ?, ?)',
			)
			.bind('avatar-ext-1', 'me', 'Me', 'https://avatars.example.com/me.png', principal.userId, '1')
			.run();
		await seedEmail(principal, { sendEmail: principal.email, name: 'Me', subject: 'local-avatar' });

		const body = await list(principal);
		const row = body.data.list.find(item => item.subject === 'local-avatar');

		expect(row.avatar.source).toBe('local');
		expect(row.avatar.verified).toBe(false);
		expect(row.avatar.url).toMatch(/^\/api\/avatar\/image\?id=/);
	});
});
