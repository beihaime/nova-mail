import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { settingConst } from '../../src/const/entity-const';
import {
	api,
	createAccount,
	createAdmin,
	createPermissionlessRole,
	seedEmail,
	sessionFor,
	updateSetting,
} from './helpers';
import emailService from '../../src/service/email-service';

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
		.prepare('SELECT archived, is_del, trashed, trash_archived FROM email WHERE email_id = ?')
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

	it('clears a star when archiving and does not restore it on unarchive', async () => {
		const principal = await sessionFor(await createAccount());
		const row = await seedEmail(principal, { subject: 'starred-archive' });
		await api('/api/star/add', { method: 'POST', token: principal.token, body: { emailId: row.email_id } });

		await put(principal.token, '/api/email/archive', [row.email_id]);
		expect(await env.db.prepare('SELECT star_id FROM star WHERE email_id = ?').bind(row.email_id).first()).toBeNull();

		await put(principal.token, '/api/email/unarchive', [row.email_id]);
		expect(await env.db.prepare('SELECT star_id FROM star WHERE email_id = ?').bind(row.email_id).first()).toBeNull();
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

	it('never archives a trashed message', async () => {
		const principal = await sessionFor(await createAccount());
		await updateSetting({ sync_delete: settingConst.syncDelete.CLOSE });
		const row = await seedEmail(principal, { subject: 'deleted-first' });

		await api(`/api/email/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: principal.token });
		await put(principal.token, '/api/email/archive', [row.email_id]);

		const stored = await storedRow(row.email_id);
		expect(stored.trashed).toBe(1);
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

describe('Trash and restore', () => {
	it('does not permanently delete a message restored after Trash selection', async () => {
		const principal = await sessionFor(await createAccount());
		const row = await seedEmail(principal, { subject: 'restore-race' });
		const key = `attachments/restore-race-${row.email_id}.txt`;
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, type) VALUES (?, ?, ?, ?, 0)')
			.bind(principal.userId, row.email_id, principal.accountId, key).run();
		await env.r2.put(key, 'kept');
		await api(`/api/email/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: principal.token });
		const context = {
			env,
			testHooks: { beforeConditionalTrashDelete: async () => {
				await emailService.restoreFromTrash({ env }, { emailIds: [row.email_id] }, principal.userId);
			} },
		};
		await emailService.deleteForever(context, { emailIds: String(row.email_id) }, principal.userId);
		expect(await env.db.prepare('SELECT email_id FROM email WHERE email_id = ?').bind(row.email_id).first()).not.toBeNull();
		expect(await env.db.prepare('SELECT att_id FROM attachments WHERE email_id = ?').bind(row.email_id).first()).not.toBeNull();
		expect(await env.r2.get(key)).not.toBeNull();
	});

	it('does not delete a message restored while emptying Trash', async () => {
		const principal = await sessionFor(await createAccount());
		const row = await seedEmail(principal, { subject: 'empty-race' });
		const key = `attachments/empty-race-${row.email_id}.txt`;
		await env.db.prepare('INSERT INTO attachments (user_id, email_id, account_id, key, type) VALUES (?, ?, ?, ?, 0)')
			.bind(principal.userId, row.email_id, principal.accountId, key).run();
		await env.r2.put(key, 'kept');
		await api(`/api/email/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: principal.token });
		await emailService.emptyTrash({ env, testHooks: { beforeConditionalTrashDelete: async () => {
			await emailService.restoreFromTrash({ env }, { emailIds: [row.email_id] }, principal.userId);
		} } }, { accountId: principal.accountId }, principal.userId);
		expect(await env.db.prepare('SELECT email_id FROM email WHERE email_id = ?').bind(row.email_id).first()).not.toBeNull();
		expect(await env.db.prepare('SELECT att_id FROM attachments WHERE email_id = ?').bind(row.email_id).first()).not.toBeNull();
		expect(await env.r2.get(key)).not.toBeNull();
	});
	it('moves an All Mail deletion to the recipient owner\'s Trash instead of physically deleting it', async () => {
		const admin = await sessionFor(await createAdmin());
		const owner = await sessionFor(await createAccount());
		const row = await seedEmail(owner, { subject: 'all-mail-soft-delete' });

		const response = await api(`/api/allEmail/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: admin.token });
		expect((await response.json()).code).toBe(200);
		expect((await storedRow(row.email_id)).trashed).toBe(1);

		const ownerTrash = await api(`/api/email/list?accountId=${owner.accountId}&type=all&size=50&trashed=1`, { token: owner.token });
		expect((await ownerTrash.json()).data.list.map(item => item.subject)).toContain('all-mail-soft-delete');
	});

	it('moves to Trash and restores regardless of the legacy sync-delete setting', async () => {
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

		expect((await storedRow(row.email_id)).trashed).toBe(1);
		expect((await listFor(principal)).total).toBe(0);

		await put(principal.token, '/api/email/restore', [row.email_id]);

		expect((await storedRow(row.email_id)).trashed).toBe(0);
		expect((await listFor(principal)).list.map((item) => item.subject)).toContain('undo-me');
	});

	it('restores the complete conversation after a thread delete', async () => {
		await updateSetting({ sync_delete: settingConst.syncDelete.CLOSE });
		const principal = await sessionFor(await createAccount());
		const threadId = `undo-thread-${principal.userId}`;
		const first = await seedEmail(principal, { subject: 'undo the thread', threadId });
		const newest = await seedEmail(principal, { subject: 'Re: undo the thread', threadId });

		await api(`/api/email/delete?emailIds=${newest.email_id}`, { method: 'DELETE', token: principal.token });
		expect((await storedRow(first.email_id)).trashed).toBe(1);
		expect((await storedRow(newest.email_id)).trashed).toBe(1);

		// The client only has the visible representative id, but Undo restores
		// every sibling that the delete action changed.
		await put(principal.token, '/api/email/restore', [newest.email_id]);
		expect((await storedRow(first.email_id)).trashed).toBe(0);
		expect((await storedRow(newest.email_id)).trashed).toBe(0);
		expect((await listFor(principal)).total).toBe(1);
	});

	it('keeps normal delete soft even when the legacy sync-delete setting is on', async () => {
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
			expect(body.data).toEqual({ soft: true });
			expect((await storedRow(row.email_id)).trashed).toBe(1);
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

		expect((await storedRow(row.email_id)).trashed).toBe(1);
	});

	it('permanently deletes only the owner\'s trashed message', async () => {
		const owner = await sessionFor(await createAccount());
		const stranger = await sessionFor(await createAccount());
		const row = await seedEmail(owner, { subject: 'forever' });
		await api(`/api/email/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: owner.token });

		await api(`/api/email/trash/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: stranger.token });
		expect((await storedRow(row.email_id)).trashed).toBe(1);

		const response = await api(`/api/email/trash/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: owner.token });
		expect((await response.json()).code).toBe(200);
		expect(await storedRow(row.email_id)).toBeNull();
	});

	it('keeps attachment metadata and objects on soft delete, then removes both on Delete forever', async () => {
		const principal = await sessionFor(await createAccount());
		const row = await seedEmail(principal, { subject: 'attachment-trash-lifecycle' });
		const key = `attachments/trash-lifecycle-${row.email_id}.txt`;
		await env.r2.put(key, 'keep me until permanent delete');
		await env.db.prepare(
			'INSERT INTO attachments (user_id, account_id, email_id, key, filename, mime_type, size, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
		).bind(principal.userId, principal.accountId, row.email_id, key, 'lifecycle.txt', 'text/plain', 30, 0).run();

		await api(`/api/email/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: principal.token });
		expect(await env.db.prepare('SELECT att_id FROM attachments WHERE email_id = ?').bind(row.email_id).first()).toBeTruthy();
		expect(await env.r2.get(key)).toBeTruthy();

		await api(`/api/email/trash/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: principal.token });
		expect(await env.db.prepare('SELECT att_id FROM attachments WHERE email_id = ?').bind(row.email_id).first()).toBeNull();
		expect(await env.r2.get(key)).toBeNull();
	});

	it('trashing a sent copy never changes an independently owned recipient copy', async () => {
		const sender = await sessionFor(await createAccount());
		const recipient = await sessionFor(await createAccount());
		const threadId = `independent-copies-${sender.userId}-${recipient.userId}`;
		const sent = await seedEmail(sender, { subject: 'sent-copy', type: 1, threadId });
		const received = await seedEmail(recipient, { subject: 'sent-copy', type: 0, threadId });

		await api(`/api/email/delete?emailIds=${sent.email_id}`, { method: 'DELETE', token: sender.token });
		expect((await storedRow(sent.email_id)).trashed).toBe(1);
		expect((await storedRow(received.email_id)).trashed).toBe(0);
		expect((await listFor(recipient)).list.map(item => item.subject)).toContain('sent-copy');

		await put(sender.token, '/api/email/restore', [sent.email_id]);
		expect((await storedRow(sent.email_id)).trashed).toBe(0);
		expect((await listFor(sender, 1)).list.map(item => item.subject)).toContain('sent-copy');
	});

	it('does not move a different account of the same user when a thread is trashed', async () => {
		const principal = await sessionFor(await createAccount());
		const secondary = await env.db.prepare(
			'INSERT INTO account (email, name, user_id, is_del, all_receive) VALUES (?, ?, ?, 0, 0) RETURNING account_id, email',
		).bind(`second.${principal.userId}@example.com`, 'second', principal.userId).first();
		const threadId = `same-user-separate-account-${principal.userId}`;
		const selected = await seedEmail(principal, { subject: 'primary-copy', threadId });
		const sibling = await seedEmail({ ...principal, accountId: secondary.account_id, email: secondary.email }, { subject: 'secondary-copy', threadId });

		await api(`/api/email/delete?emailIds=${selected.email_id}`, { method: 'DELETE', token: principal.token });
		expect((await storedRow(selected.email_id)).trashed).toBe(1);
		expect((await storedRow(sibling.email_id)).trashed).toBe(0);
	});

	it('lists only Trash and restores an archived message to Archive', async () => {
		const principal = await sessionFor(await createAccount());
		const archived = await seedEmail(principal, { subject: 'archive-before-trash' });
		const visible = await seedEmail(principal, { subject: 'keep-visible' });
		await put(principal.token, '/api/email/archive', [archived.email_id]);
		await api(`/api/email/delete?emailIds=${archived.email_id}`, { method: 'DELETE', token: principal.token });

		const response = await api(`/api/email/list?accountId=${principal.accountId}&type=0&size=50&trashed=1`, { token: principal.token });
		const trash = (await response.json()).data;
		expect(trash.list.map(item => item.subject)).toContain('archive-before-trash');
		expect(trash.list.map(item => item.subject)).not.toContain('keep-visible');

		await put(principal.token, '/api/email/restore', [archived.email_id]);
		expect((await storedRow(archived.email_id)).archived).toBe(1);
	});

	it('keeps trashed matches out of normal keyword search', async () => {
		const principal = await sessionFor(await createAccount());
		const row = await seedEmail(principal, { subject: 'unique trash search token' });
		await api(`/api/email/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: principal.token });

		const normal = await api(`/api/email/list?accountId=${principal.accountId}&type=0&size=50&keyword=unique%20trash%20search%20token`, { token: principal.token });
		expect((await normal.json()).data.total).toBe(0);
		const trash = await api(`/api/email/list?accountId=${principal.accountId}&type=all&size=50&keyword=unique%20trash%20search%20token&trashed=1`, { token: principal.token });
		expect((await trash.json()).data.list.map(item => item.subject)).toContain('unique trash search token');
	});

	it('clears a starred message when it moves to Trash and keeps it unstarred on restore', async () => {
		const principal = await sessionFor(await createAccount());
		const row = await seedEmail(principal, { subject: 'starred-trash' });
		await api('/api/star/add', { method: 'POST', token: principal.token, body: { emailId: row.email_id } });
		await api(`/api/email/delete?emailIds=${row.email_id}`, { method: 'DELETE', token: principal.token });

		const starred = await api('/api/star/list?size=50', { token: principal.token });
		expect((await starred.json()).data.list.map(item => item.subject)).not.toContain('starred-trash');
		expect(await env.db.prepare('SELECT star_id FROM star WHERE email_id = ?').bind(row.email_id).first()).toBeNull();

		await put(principal.token, '/api/email/restore', [row.email_id]);
		expect(await env.db.prepare('SELECT star_id FROM star WHERE email_id = ?').bind(row.email_id).first()).toBeNull();
	});

	it('empties only the current owner/account Trash', async () => {
		const owner = await sessionFor(await createAccount());
		const other = await sessionFor(await createAccount());
		const owned = await seedEmail(owner, { subject: 'owned-trash' });
		const theirs = await seedEmail(other, { subject: 'other-trash' });
		await api(`/api/email/delete?emailIds=${owned.email_id}`, { method: 'DELETE', token: owner.token });
		await api(`/api/email/delete?emailIds=${theirs.email_id}`, { method: 'DELETE', token: other.token });

		await api(`/api/email/trash/empty?accountId=${owner.accountId}`, { method: 'DELETE', token: owner.token });
		expect(await storedRow(owned.email_id)).toBeNull();
		expect((await storedRow(theirs.email_id)).trashed).toBe(1);
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
