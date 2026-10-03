import { beforeAll, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { api, createAdmin, seedEmail, sessionFor } from './helpers';

describe('mail-list API pagination limits', () => {
	let admin;

	beforeAll(async () => {
		admin = await sessionFor(await createAdmin());
		for (let index = 0; index < 12; index += 1) {
			const row = await seedEmail(admin, { subject: `pagination-security-${index}` });
			await env.db.prepare('INSERT INTO star (user_id, email_id) VALUES (?, ?)').bind(admin.userId, row.email_id).run();
		}
	});

	it.each(['-1', '0', '1.5', 'NaN', '999999'])('bounds size=%s on every list route', async size => {
		const query = encodeURIComponent(size);
		const routes = [
			{ path: `/api/email/list?accountId=${admin.accountId}&type=0&size=${query}`, max: 10 },
			{ path: `/api/star/list?size=${query}`, max: 50 },
			{ path: `/api/account/list?size=${query}`, max: 30 },
			{ path: `/api/allEmail/list?size=${query}`, max: 10 },
			{ path: `/api/user/list?size=${query}`, max: 50 },
			{ path: `/api/user/allAccount?userId=${admin.userId}&size=${query}`, max: 30 },
		];
		for (const { path, max } of routes) {
			const body = await (await api(path, { token: admin.token })).json();
			expect(body.code, path).toBe(200);
			const list = Array.isArray(body.data) ? body.data : body.data.list;
			expect(list.length, path).toBeLessThanOrEqual(max);
		}
		const publicBody = await (await api('/api/public/emailList', {
			token: admin.token, method: 'POST', body: { size },
		})).json();
		expect(publicBody.code).toBe(200);
		expect(publicBody.data.length).toBeLessThanOrEqual(size === '999999' ? 50 : 20);
	});

	it('does not permit LIMIT -1 to return the whole mailbox', async () => {
		const body = await (await api(`/api/email/list?accountId=${admin.accountId}&type=0&size=-1`, { token: admin.token })).json();
		expect(body.code).toBe(200);
		expect(body.data.list).toHaveLength(10);
		expect(body.data.total).toBeGreaterThan(10);
	});
});
