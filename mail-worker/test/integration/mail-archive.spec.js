import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { settingConst } from '../../src/const/entity-const';
import {
	api,
	createAccount,
	createPermissionlessRole,
	seedEmail,
	sessionFor,
	updateSetting,
} from './helpers';

/**
 * The archive flag and the undo endpoints behind the mobile swipe actions.
 *
 * Archive has to be lossless (the row stays, the Inbox stops listing it) and
 * reversible, and every mutation has to be scoped to the caller. Undo is only
 * offered when it can actually work, which is what the `soft` flag on delete
 * reports.
 */

async function listFor(principal, type = 0, archived) {
	const query = new URLSearchParams({
		accountId: String(principal.accountId),
		type: String(type),
		size: '50',
	});
	if (archived !== undefined) query.set('archived', String(archived));

	const response = await api(`/api/email/list?${query}`, { token: principal.token });
	const body = await response.json();
	expect(body.code).toBe(200);
	return body.data;
}

function put(token, path, emailIds) {
	return api(path, { method: 'PUT', token, body: { emailIds } });
}

async function storedRow(emailId) {
	return env.db
		.prepare('SELECT archived, is_del FROM email WHERE email_id = ?')
		.bind(emailId)
		.first();
}

describe('archiving', () => {
	it('removes the message from the Inbox but keeps the row', async () => {
		const principal = await sessionFor(await createAccount());
		const row = await seedEmail(principal, { subject: 'archive-me' });

		const response = await put(principal.token, '/api/email/archive', [row.email_id]);
		expect((await response.json()).code).toBe(200);

		const inbox = await listFor(principal);
		expect(inbox.list.map((item) => item.subject)).not.toContain('archive-me');
		expect(inbox.total).toBe(0);

		// Lossless: nothing was deleted.
		const stored = await storedRow(row.email_id);
		expect(stored.archived).toBe(1);
		expect(stored.is_del).toBe(0);
	});

	it('puts the message back with unarchive', async () => {
		const principal = await sessionFor(await createAccount());
		const row = await seedEmail(principal, { subject: 'restore-me' });

		await put(principal.token, '/api/email/archive', [row.email_id]);
		expect((await listFor(principal)).total).toBe(0);

		await put(principal.token, '/api/email/unarchive', [row.email_id]);

		const inbox = await listFor(principal);
		expect(inbox.list.map((item) => item.subject)).toContain('restore-me');
		expect((await storedRow(row.email_id)).archived).toBe(0);
	});

	it('leaves other messages in the Inbox alone', async () => {
		const principal = await sessionFor(await createAccount());
		const kept = await seedEmail(principal, { subject: 'kept' });
		const archived = await seedEmail(principal, { subject: 'archived' });

		await put(principal.token, '/api/email/archive', [archived.email_id]);

		const inbox = await listFor(principal);
		expect(inbox.list.map((item) => item.subject)).toEqual(['kept']);
		expect(inbox.total).toBe(1);
		expect((await storedRow(kept.email_id)).archived).toBe(0);
	});

	it('cannot archive a message owned by another user', async () => {
		const owner = await sessionFor(await createAccount());
		const stranger = await sessionFor(await createAccount());
		const row = await seedEmail(owner, { subject: 'not-yours-to-archive' });

		const response = await put(stranger.token, '/api/email/archive', [row.email_id]);
		expect((await response.json()).code).toBe(200);

		// The request succeeded but changed nothing.
		expect((await storedRow(row.email_id)).archived).toBe(0);
		expect((await listFor(owner)).list.map((item) => item.subject)).toContain('not-yours-to-archive');
	});

	it('never archives a deleted message', async () => {
		const principal = await sessionFor(await createAccount());
		await updateSetting({ sync_delete: settingConst.syncDelete.CLOSE });
		const row = await seedEmail(principal, { subject: 'deleted-first' });

		await api(`/api/email/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: principal.token });
		await put(principal.token, '/api/email/archive', [row.email_id]);

		const stored = await storedRow(row.email_id);
		expect(stored.is_del).toBe(1);
		expect(stored.archived).toBe(0);
	});

	it('ignores an empty or unusable id list instead of failing', async () => {
		const principal = await sessionFor(await createAccount());

		for (const ids of [[], ['nonsense'], [0], [-3]]) {
			const response = await put(principal.token, '/api/email/archive', ids);
			expect((await response.json()).code).toBe(200);
		}
	});
});

describe('delete and restore (undo)', () => {
	it('soft-deletes and restores when sync-delete is off, so undo is possible', async () => {
		await updateSetting({ sync_delete: settingConst.syncDelete.CLOSE });
		const principal = await sessionFor(await createAccount());
		const row = await seedEmail(principal, { subject: 'undo-me' });

		const deleted = await api(`/api/email/delete?emailIds=${row.email_id}`, {
			method: 'DELETE',
			token: principal.token,
		});
		const deletedBody = await deleted.json();
		expect(deletedBody.code).toBe(200);
		// The client uses this flag to decide whether to offer Undo at all.
		expect(deletedBody.data).toEqual({ soft: true });

		expect((await storedRow(row.email_id)).is_del).toBe(1);
		expect((await listFor(principal)).total).toBe(0);

		await put(principal.token, '/api/email/restore', [row.email_id]);

		expect((await storedRow(row.email_id)).is_del).toBe(0);
		expect((await listFor(principal)).list.map((item) => item.subject)).toContain('undo-me');
	});

	it('reports that a permanent delete cannot be undone', async () => {
		await updateSetting({ sync_delete: settingConst.syncDelete.OPEN });
		try {
			const principal = await sessionFor(await createAccount());
			const row = await seedEmail(principal, { subject: 'gone-for-good' });

			const deleted = await api(`/api/email/delete?emailIds=${row.email_id}`, {
				method: 'DELETE',
				token: principal.token,
			});
			const body = await deleted.json();

			expect(body.code).toBe(200);
			expect(body.data).toEqual({ soft: false });
			expect(await storedRow(row.email_id)).toBeNull();
		} finally {
			await updateSetting({ sync_delete: settingConst.syncDelete.CLOSE });
		}
	});

	it('cannot restore a message owned by another user', async () => {
		await updateSetting({ sync_delete: settingConst.syncDelete.CLOSE });
		const owner = await sessionFor(await createAccount());
		const stranger = await sessionFor(await createAccount());
		const row = await seedEmail(owner, { subject: 'theirs' });

		await api(`/api/email/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: owner.token });
		await put(stranger.token, '/api/email/restore', [row.email_id]);

		expect((await storedRow(row.email_id)).is_del).toBe(1);
	});
});

describe('archived mail and the new-mail poll', () => {
	it('does not report an archived message as the newest arrival', async () => {
		const principal = await sessionFor(await createAccount());
		const older = await seedEmail(principal, { subject: 'older' });
		const newest = await seedEmail(principal, { subject: 'newest' });

		await put(principal.token, '/api/email/archive', [newest.email_id]);

		const response = await api(
			`/api/email/latest?emailId=${older.email_id}&accountId=${principal.accountId}&allReceive=0`,
			{ token: principal.token },
		);
		const body = await response.json();

		expect(body.code).toBe(200);
		expect(body.data.map((item) => item.subject)).not.toContain('newest');
	});
});

describe('the Archive view query', () => {
	it('lists archived mail only when the view asks for it', async () => {
		const principal = await sessionFor(await createAccount());
		const inboxRow = await seedEmail(principal, { subject: 'still-in-inbox' });
		const archivedRow = await seedEmail(principal, { subject: 'moved-to-archive' });

		await put(principal.token, '/api/email/archive', [archivedRow.email_id]);

		// `archived=1` is what the Archive view sends.
		const archive = await listFor(principal, 0, 1);
		expect(archive.list.map((item) => item.subject)).toEqual(['moved-to-archive']);
		expect(archive.total).toBe(1);

		// The Inbox keeps the default and must not see it.
		const inbox = await listFor(principal, 0, 0);
		expect(inbox.list.map((item) => item.subject)).toEqual(['still-in-inbox']);
		expect(inbox.total).toBe(1);
		expect(inboxRow.email_id).not.toBe(archivedRow.email_id);
	});

	it('only archives real, owned mail into the view', async () => {
		const owner = await sessionFor(await createAccount());
		const stranger = await sessionFor(await createAccount());

		const row = await seedEmail(owner, { subject: 'owners-archive' });
		await put(owner.token, '/api/email/archive', [row.email_id]);

		const strangerArchive = await listFor(stranger, 0, 1);
		expect(strangerArchive.list).toEqual([]);
		expect(strangerArchive.total).toBe(0);
	});

	it('pages through the archive with the same cursor as the Inbox', async () => {
		const principal = await sessionFor(await createAccount());
		const ids = [];
		for (let index = 0; index < 5; index += 1) {
			const row = await seedEmail(principal, { subject: `arch-${index}` });
			ids.push(row.email_id);
		}
		await put(principal.token, '/api/email/archive', ids);

		const first = await listFor(principal, 0, 1);
		expect(first.total).toBe(5);

		const cursor = first.list[first.list.length - 1].emailId;
		const response = await api(
			`/api/email/list?${new URLSearchParams({
				accountId: String(principal.accountId),
				type: '0',
				size: '2',
				archived: '1',
				emailId: String(cursor),
			})}`,
			{ token: principal.token },
		);
		const page = (await response.json()).data;

		const firstIds = first.list.map((item) => item.emailId);
		expect(firstIds).toEqual([...firstIds].sort((a, b) => b - a));
		page.list.forEach((item) => {
			expect(item.emailId).toBeLessThan(cursor);
			expect(firstIds).not.toContain(item.emailId);
		});
	});
});

describe('swipe route permissions', () => {
	it('refuses archive, unarchive and restore to a user without email:delete', async () => {
		const roleId = await createPermissionlessRole();
		const principal = await sessionFor(await createAccount(undefined, { roleId }));
		const row = await seedEmail(principal, { subject: 'gated' });

		for (const path of ['/api/email/archive', '/api/email/unarchive', '/api/email/restore']) {
			const response = await put(principal.token, path, [row.email_id]);
			expect((await response.json()).code, path).toBe(403);
		}

		// Nothing was changed by the rejected calls.
		expect((await storedRow(row.email_id)).archived).toBe(0);
		expect((await storedRow(row.email_id)).is_del).toBe(0);
	});
});
