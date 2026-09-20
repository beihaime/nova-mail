import { beforeAll, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { settingConst } from '../../src/const/entity-const';
import { api, createAccount, seedEmail, sessionFor, updateSetting } from './helpers';

async function listFor(principal, { size = 10, emailId, type = 0 } = {}) {
	const params = new URLSearchParams({ accountId: String(principal.accountId), type: String(type), size: String(size) });
	if (emailId) params.set('emailId', String(emailId));

	const response = await api(`/api/email/list?${params}`, { token: principal.token });
	const body = await response.json();
	expect(body.code).toBe(200);
	return body.data;
}

describe('mailbox list pagination', () => {
	let principal;

	beforeAll(async () => {
		principal = await sessionFor(await createAccount());
		// 12 messages, ids ascending, each its own conversation.
		for (let index = 0; index < 12; index += 1) {
			await seedEmail(principal, { subject: `page-${index}` });
		}
	});

	it('returns a first page, the true total and a usable cursor', async () => {
		const data = await listFor(principal, { size: 5 });

		expect(data.list).toHaveLength(5);
		expect(data.total).toBe(12);

		const ids = data.list.map((row) => row.emailId);
		// Newest first, and every id is unique.
		expect(ids).toEqual([...ids].sort((a, b) => b - a));
		expect(new Set(ids).size).toBe(5);
	});

	it('walks every page without gaps or repeats', async () => {
		const seen = [];
		let cursor = 0;

		for (let page = 0; page < 3; page += 1) {
			const data = await listFor(principal, { size: 5, emailId: cursor });
			seen.push(...data.list.map((row) => row.emailId));
			expect(data.total).toBe(12);
			cursor = seen[seen.length - 1];
		}

		expect(seen).toHaveLength(12);
		expect(new Set(seen).size).toBe(12);
		expect(seen).toEqual([...seen].sort((a, b) => b - a));
	});

	it('never leaks another account into the list', async () => {
		const stranger = await sessionFor(await createAccount());
		await seedEmail(stranger, { subject: 'not-yours' });

		const mine = await listFor(principal, { size: 50 });
		const theirs = await listFor(stranger, { size: 50 });

		expect(mine.list.map((row) => row.subject)).not.toContain('not-yours');
		expect(theirs.list.map((row) => row.subject)).toContain('not-yours');
		// The stranger only ever sees their own single message.
		expect(theirs.total).toBe(1);
	});
});

describe('page-size limit', () => {
	it('caps a hostile page size at the documented maximum', async () => {
		const principal = await sessionFor(await createAccount());
		for (let index = 0; index < 55; index += 1) {
			await seedEmail(principal, { subject: `wide-${index}` });
		}

		const data = await listFor(principal, { size: 100000 });

		expect(data.total).toBe(55);
		expect(data.list).toHaveLength(50);
	});
});

describe('conversation threading', () => {
	let principal;
	let rootId;

	beforeAll(async () => {
		principal = await sessionFor(await createAccount());
		const threadId = `thread-${principal.userId}`;
		rootId = (await seedEmail(principal, { subject: 'Lunch?', threadId })).email_id;
		const replyId = (await seedEmail(principal, {
			subject: 'Re: Lunch?',
			threadId,
			inReplyTo: 'root@example.com',
		})).email_id;
		await seedEmail(principal, { subject: 'Re: Lunch?', threadId, inReplyTo: `msg-${replyId}` });
	});

	it('collapses a conversation to its newest message in the Inbox', async () => {
		const data = await listFor(principal, { size: 50 });

		// One row for the whole thread, and it is the newest reply.
		expect(data.list.map((row) => row.subject)).toEqual(['Re: Lunch?']);
		expect(data.total).toBe(1);
	});

	it('returns the whole conversation oldest → newest from the anchor', async () => {
		const response = await api(`/api/email/thread?emailId=${rootId}&accountId=${principal.accountId}`, {
			token: principal.token,
		});
		const body = await response.json();

		expect(body.code).toBe(200);
		expect(body.data.messages).toHaveLength(3);
		expect(body.data.subject).toBe('Lunch?');

		const ids = body.data.messages.map((message) => message.emailId);
		expect(ids).toEqual([...ids].sort((a, b) => a - b));
	});

	it('refuses to open a conversation owned by someone else', async () => {
		const stranger = await sessionFor(await createAccount());
		const response = await api(`/api/email/thread?emailId=${rootId}&accountId=${stranger.accountId}`, {
			token: stranger.token,
		});

		expect((await response.json()).code).not.toBe(200);
	});
});

describe('mail deletion', () => {
	let victim;
	let owner;

	beforeAll(async () => {
		owner = await sessionFor(await createAccount());
		victim = await sessionFor(await createAccount());
	});

	it('hides a soft-deleted message from the list', async () => {
		await updateSetting({ sync_delete: settingConst.syncDelete.CLOSE });
		const row = await seedEmail(owner, { subject: 'delete-me' });
		await seedEmail(owner, { subject: 'keep-me' });

		const response = await api(`/api/email/delete?emailIds=${row.email_id}`, {
			method: 'DELETE',
			token: owner.token,
		});
		expect((await response.json()).code).toBe(200);

		const data = await listFor(owner, { size: 50 });
		expect(data.list.map((item) => item.subject)).not.toContain('delete-me');
		expect(data.list.map((item) => item.subject)).toContain('keep-me');

		const stored = await env.db
			.prepare('SELECT is_del FROM email WHERE email_id = ?')
			.bind(row.email_id)
			.first();
		expect(stored.is_del).toBe(1);
	});

	it('removes the row entirely when sync-delete is on', async () => {
		await updateSetting({ sync_delete: settingConst.syncDelete.OPEN });
		try {
			const row = await seedEmail(owner, { subject: 'hard-delete' });

			await api(`/api/email/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: owner.token });

			const stored = await env.db
				.prepare('SELECT email_id FROM email WHERE email_id = ?')
				.bind(row.email_id)
				.first();
			expect(stored).toBeNull();
		} finally {
			await updateSetting({ sync_delete: settingConst.syncDelete.CLOSE });
		}
	});

	it('cannot delete a message owned by another user', async () => {
		const row = await seedEmail(owner, { subject: 'not-yours-to-delete' });

		const response = await api(`/api/email/delete?emailIds=${row.email_id}`, {
			method: 'DELETE',
			token: victim.token,
		});
		expect((await response.json()).code).toBe(200);

		const stored = await env.db
			.prepare('SELECT is_del FROM email WHERE email_id = ?')
			.bind(row.email_id)
			.first();
		expect(stored.is_del).toBe(0);
	});
});
