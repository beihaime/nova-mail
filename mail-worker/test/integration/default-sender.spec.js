import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { emailConst, settingConst } from '../../src/const/entity-const';
import { api, createAccount, createAdmin, json, openSend, sessionFor, uniqueEmail, updateSetting } from './helpers';

/**
 * Default sender address, end to end.
 *
 * The preference lives in `user_preferences.default_sender_account_id` and is
 * nullable: an existing user has no row (or a NULL column) and the runtime
 * resolver falls back to the primary address, then to the first active
 * send-capable one. These tests pin the whole contract — persistence,
 * authorization, the legacy fallback, repair after an address disappears, and
 * the send-time re-authorization that must not trust the composer.
 *
 * The seeded default role is `send_type = 'ban'`, so anything that expects a
 * successful send creates its own send-capable role.
 */

async function addAddress(session, email) {
	const body = await json(await api('/api/account/add', {
		token: session.token, method: 'POST', body: { email },
	}));
	expect(body.code).toBe(200);
	return body.data;
}

/** Insert an address row directly, for a role that may not add addresses. */
async function seedAddress(principal, email) {
	return env.db
		.prepare('INSERT INTO account (email, name, user_id, is_del, all_receive) VALUES (?, ?, ?, 0, 0) RETURNING account_id, email, user_id')
		.bind(email, email.split('@')[0], principal.userId)
		.first();
}

async function createRole({ sendType = 'count', availDomain = '' } = {}) {
	const row = await env.db
		.prepare("INSERT INTO role (name, is_default, send_count, send_type, account_count, avail_domain) VALUES (?, 0, NULL, ?, 0, ?) RETURNING role_id")
		.bind(`test-role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, sendType, availDomain)
		.first();
	// Clone the seeded role's permissions (account list/add, email send, ...) so
	// only the send policy differs from the default identity.
	await env.db
		.prepare('INSERT INTO role_perm (role_id, perm_id) SELECT ?, perm_id FROM role_perm WHERE role_id = 1')
		.bind(row.role_id).run();
	return row.role_id;
}

/**
 * The seeded default role is `send_type = 'ban'`, so a user who is expected to
 * have an effective sender needs a role that may actually send. One shared role
 * keeps the extra inserts out of every test.
 */
let sharedSendRole = null;
async function createSender(email = uniqueEmail('sender')) {
	if (sharedSendRole == null) sharedSendRole = await createRole();
	return sessionFor(await createAccount(email, { roleId: sharedSendRole }));
}

async function loginInfo(session) {
	return (await json(await api('/api/my/loginUserInfo', { token: session.token }))).data;
}

function setDefault(session, accountId) {
	return api('/api/account/setDefaultSender', {
		token: session.token, method: 'PUT', body: { accountId },
	}).then(json);
}

/** The stored preference, normalized to null when no row/value exists. */
async function storedDefault(userId) {
	const row = await env.db
		.prepare('SELECT default_sender_account_id FROM user_preferences WHERE user_id = ?')
		.bind(userId).first();
	return row?.default_sender_account_id ?? null;
}

describe('default sender address', () => {
	it('falls back to the primary address for a legacy user with no stored preference', async () => {
		const alice = await createSender();

		const info = await loginInfo(alice);
		expect(info.defaultSender.email).toBe(alice.email);
		expect(info.defaultSenderAccountId).toBe(alice.accountId);

		// Compatibility path: the migration must not have written anything.
		expect(await storedDefault(alice.userId)).toBeNull();
	});

	it('stores an active send-capable address and returns it on the next session', async () => {
		const alice = await createSender();
		const alias = await addAddress(alice, uniqueEmail('alias'));

		const response = await setDefault(alice, alias.accountId);
		expect(response.code).toBe(200);
		expect(response.data.configuredAccountId).toBe(alias.accountId);
		expect(response.data.effectiveSender.email).toBe(alias.email);

		expect(await storedDefault(alice.userId)).toBe(alias.accountId);

		// A brand-new session (the login payload the composer reads) resolves the
		// same address.
		const renewed = await sessionFor(alice);
		const info = await loginInfo(renewed);
		expect(info.defaultSender.email).toBe(alias.email);
		expect(info.defaultSenderAccountId).toBe(alias.accountId);

		// Clearing restores the primary without leaving a preference behind.
		const cleared = await setDefault(alice, null);
		expect(cleared.data.configuredAccountId).toBeNull();
		expect(cleared.data.effectiveSender.email).toBe(alice.email);
		expect((await loginInfo(alice)).defaultSender.email).toBe(alice.email);
	});

	it('reports each address’s send capability from the server', async () => {
		const alice = await createSender();
		await addAddress(alice, uniqueEmail('alias'));

		const list = await json(await api('/api/account/list', { token: alice.token }));
		expect(list.code).toBe(200);
		expect(list.data.every((row) => row.canSend === true)).toBe(true);

		// An address the role may not send from is reported as unusable, which is
		// what keeps "Set as default sender" off its row.
		const restrictedRole = await createRole({ availDomain: 'other.example' });
		const bob = await sessionFor(await createAccount(uniqueEmail('bob'), { roleId: restrictedRole }));
		const bobAlias = await seedAddress(bob, uniqueEmail('bob-alias'));
		const bobList = await json(await api('/api/account/list', { token: bob.token }));
		expect(bobList.data.find((row) => row.accountId === bobAlias.account_id).canSend).toBe(false);
		expect(bobList.data.find((row) => row.accountId === bob.accountId).canSend).toBe(false);
	});

	it('rejects another user’s address, an unknown address and a deleted one', async () => {
		const alice = await createSender();
		const bob = await sessionFor(await createAccount());
		const bobAlias = await addAddress(bob, uniqueEmail('bob-only'));

		// Someone else's address is indistinguishable from an unknown one.
		expect((await setDefault(alice, bobAlias.accountId)).code).toBe(404);
		expect((await setDefault(alice, 999999)).code).toBe(404);
		expect((await setDefault(alice, 'not-a-number')).code).toBe(404);

		// Neither user gained a preference from the rejected attempts.
		expect(await storedDefault(alice.userId)).toBeNull();
		expect(await storedDefault(bob.userId)).toBeNull();

		const alias = await addAddress(alice, uniqueEmail('alice-deleted'));
		await api(`/api/account/delete?accountId=${alias.accountId}`, { token: alice.token, method: 'DELETE' });
		expect((await setDefault(alice, alias.accountId)).code).toBe(404);
	});

	it('rejects an address that is disabled or no longer send-capable', async () => {
		const alice = await createSender();
		const disabled = await addAddress(alice, uniqueEmail('alice-disabled'));
		await env.db.prepare('UPDATE account SET status = 1 WHERE account_id = ?')
			.bind(disabled.accountId).run();
		expect((await setDefault(alice, disabled.accountId)).code).toBe(403);
		expect(await storedDefault(alice.userId)).toBeNull();

		// A role whose available-domain list excludes the address.
		const restrictedRole = await createRole({ availDomain: 'other.example' });
		const carol = await sessionFor(await createAccount(uniqueEmail('carol'), { roleId: restrictedRole }));
		const carolAlias = await seedAddress(carol, uniqueEmail('carol-alias'));
		expect((await setDefault(carol, carolAlias.account_id)).code).toBe(403);
		expect((await setDefault(carol, carol.accountId)).code).toBe(403);
		expect(await storedDefault(carol.userId)).toBeNull();
	});

	it('resolves a valid fallback when the configured default is deleted', async () => {
		const alice = await createSender();
		const alias = await addAddress(alice, uniqueEmail('alice-default'));

		expect((await setDefault(alice, alias.accountId)).code).toBe(200);
		await api(`/api/account/delete?accountId=${alias.accountId}`, { token: alice.token, method: 'DELETE' });

		// The stored reference was repaired, not left dangling.
		expect(await storedDefault(alice.userId)).toBe(alice.accountId);
		expect((await loginInfo(alice)).defaultSender.email).toBe(alice.email);
	});

	it('resolves a valid fallback when the configured default is soft-deleted', async () => {
		const alice = await createSender();
		const alias = await addAddress(alice, uniqueEmail('alice-soft'));
		expect((await setDefault(alice, alias.accountId)).code).toBe(200);

		// `sync_delete` closed: the address row survives with `is_del = 1`, so the
		// repair has to treat the still-present row as unusable.
		await updateSetting({ sync_delete: settingConst.syncDelete.CLOSE });
		try {
			const removed = await json(await api(`/api/account/delete?accountId=${alias.accountId}`, {
				token: alice.token, method: 'DELETE',
			}));
			expect(removed.code).toBe(200);
		} finally {
			await updateSetting({ sync_delete: settingConst.syncDelete.OPEN });
		}

		expect(await storedDefault(alice.userId)).toBe(alice.accountId);
		expect((await loginInfo(alice)).defaultSender.email).toBe(alice.email);
	});

	it('resolves a valid fallback when an administrator removes the address', async () => {
		const alice = await createSender();
		const admin = await sessionFor(await createAdmin());
		const alias = await addAddress(alice, uniqueEmail('admin-removed'));

		expect((await setDefault(alice, alias.accountId)).code).toBe(200);
		const removed = await json(await api(`/api/user/deleteAccount?accountId=${alias.accountId}`, {
			token: admin.token, method: 'DELETE',
		}));
		expect(removed.code).toBe(200);

		// A hard delete must not leave the address id behind either.
		expect(await storedDefault(alice.userId)).toBe(alice.accountId);
		expect((await loginInfo(alice)).defaultSender.email).toBe(alice.email);
	});

	it('recovers and repairs when the configured address becomes disabled', async () => {
		const alice = await createSender();
		const alias = await addAddress(alice, uniqueEmail('alice-disable'));

		expect((await setDefault(alice, alias.accountId)).code).toBe(200);
		await env.db.prepare('UPDATE account SET status = 1 WHERE account_id = ?')
			.bind(alias.accountId).run();

		// The dangling reference is still on disk before anyone reads it...
		expect(await storedDefault(alice.userId)).toBe(alias.accountId);

		// ...and reading the identity returns a valid sender and rewrites it.
		const info = await loginInfo(alice);
		expect(info.defaultSender.email).toBe(alice.email);
		expect(await storedDefault(alice.userId)).toBe(alice.accountId);
	});

	it('never resolves an unauthorized sender when every address is gone', async () => {
		const alice = await createSender();
		const alias = await addAddress(alice, uniqueEmail('only-other'));
		expect((await setDefault(alice, alias.accountId)).code).toBe(200);

		// Remove every address the user owns behind the API's back.
		await env.db.prepare('UPDATE account SET is_del = 1 WHERE user_id = ?').bind(alice.userId).run();

		const info = await loginInfo(alice);
		expect(info.defaultSender).toBeNull();
		expect(info.defaultSenderAccountId).toBeNull();
		// With no usable address the preference is cleared rather than pointing at
		// a row the user can no longer use.
		expect(await storedDefault(alice.userId)).toBeNull();
	});
});

describe('send-time sender authorization', () => {
	it('sends from an owned address and rejects every forged identity', async () => {
		await openSend();
		const alice = await createSender(uniqueEmail('alice'));
		const recipient = await sessionFor(await createAccount());
		const alias = await addAddress(alice, uniqueEmail('alice-send'));

		const bob = await sessionFor(await createAccount());
		const bobAlias = await addAddress(bob, uniqueEmail('bob-send'));

		const base = {
			receiveEmail: [recipient.email],
			subject: `sender-auth-${Date.now()}`,
			content: '<p>hello</p>',
			text: 'hello',
			sendType: '',
			attachments: [],
		};

		// The authorized address the composer selected.
		const ok = await json(await api('/api/email/send', {
			token: alice.token,
			method: 'POST',
			body: { ...base, accountId: alias.accountId, sendEmail: alias.email },
		}));
		expect(ok.code).toBe(200);
		expect(ok.data[0].sendEmail).toBe(alias.email);

		const stored = await env.db
			.prepare('SELECT send_email FROM email WHERE email_id = ?')
			.bind(ok.data[0].emailId).first();
		expect(stored.send_email).toBe(alias.email);

		// Another user's address can never be the sender.
		const foreign = await json(await api('/api/email/send', {
			token: alice.token, method: 'POST', body: { ...base, accountId: bobAlias.accountId },
		}));
		expect(foreign.code).not.toBe(200);

		// A forged From with no matching owned account id.
		const forgedBody = await json(await api('/api/email/send', {
			token: alice.token, method: 'POST', body: { ...base, from: bob.email },
		}));
		expect(forgedBody.code).not.toBe(200);

		const forgedFrom = await json(await api('/api/email/send', {
			token: alice.token, method: 'POST',
			body: { ...base, accountId: alias.accountId, from: bobAlias.email },
		}));
		expect(forgedFrom.code).toBe(403);

		// The composer's own `sendEmail` field is checked too.
		const mismatched = await json(await api('/api/email/send', {
			token: alice.token, method: 'POST',
			body: { ...base, accountId: alias.accountId, sendEmail: bobAlias.email },
		}));
		expect(mismatched.code).toBe(403);

		// Nothing above was delivered twice.
		const delivered = await env.db
			.prepare('SELECT count(*) AS total FROM email WHERE subject = ? AND type = ?')
			.bind(base.subject, emailConst.type.RECEIVE).first();
		expect(delivered.total).toBe(1);
	});

	it('rejects a From that names a different owned address than the account id', async () => {
		await openSend();
		const alice = await createSender(uniqueEmail('alice-owned'));
		const recipient = await sessionFor(await createAccount());
		const first = await addAddress(alice, uniqueEmail('alice-first'));
		const second = await addAddress(alice, uniqueEmail('alice-second'));

		const base = {
			receiveEmail: [recipient.email],
			subject: `owned-mismatch-${Date.now()}`,
			content: '<p>hello</p>',
			text: 'hello',
			sendType: '',
			attachments: [],
		};

		// Both addresses are the caller's own, but the message must be sent from
		// the one the supplied id selects — not from whatever the client claims.
		const swapped = await json(await api('/api/email/send', {
			token: alice.token, method: 'POST',
			body: { ...base, accountId: first.accountId, sendEmail: second.email },
		}));
		expect(swapped.code).toBe(403);

		// The matching pair still sends.
		const matching = await json(await api('/api/email/send', {
			token: alice.token, method: 'POST',
			body: { ...base, accountId: second.accountId, sendEmail: second.email },
		}));
		expect(matching.code).toBe(200);
		expect(matching.data[0].sendEmail).toBe(second.email);
	});

	it('never changes the stored default when a message uses another address', async () => {
		await openSend();
		const alice = await createSender(uniqueEmail('alice-switch'));
		const recipient = await sessionFor(await createAccount());
		const preferred = await addAddress(alice, uniqueEmail('alice-preferred'));
		const chosen = await addAddress(alice, uniqueEmail('alice-chosen'));

		expect((await setDefault(alice, preferred.accountId)).code).toBe(200);

		// Compose was switched to another address for this one message.
		const sent = await json(await api('/api/email/send', {
			token: alice.token, method: 'POST',
			body: {
				accountId: chosen.accountId, sendEmail: chosen.email, receiveEmail: [recipient.email],
				subject: `manual-from-${Date.now()}`, content: '<p>hi</p>', text: 'hi',
				sendType: '', attachments: [],
			},
		}));
		expect(sent.code).toBe(200);
		expect(sent.data[0].sendEmail).toBe(chosen.email);

		// The per-message choice must not have become a preference change.
		expect(await storedDefault(alice.userId)).toBe(preferred.accountId);
		const info = await loginInfo(alice);
		expect(info.defaultSender.email).toBe(preferred.email);
		expect(info.defaultSenderAccountId).toBe(preferred.accountId);
	});

	it('rejects a deleted or disabled address at send time', async () => {
		await openSend();
		const alice = await createSender(uniqueEmail('alice-gone'));
		const recipient = await sessionFor(await createAccount());
		const alias = await addAddress(alice, uniqueEmail('alice-gone-alias'));

		const base = {
			receiveEmail: [recipient.email],
			subject: `sender-gone-${Date.now()}`,
			content: '<p>hello</p>',
			text: 'hello',
			sendType: '',
			attachments: [],
		};

		await api(`/api/account/delete?accountId=${alias.accountId}`, { token: alice.token, method: 'DELETE' });
		const deleted = await json(await api('/api/email/send', {
			token: alice.token, method: 'POST', body: { ...base, accountId: alias.accountId },
		}));
		expect(deleted.code).not.toBe(200);

		// A disabled owned address is refused even though it still belongs to the
		// caller — ownership alone is not send permission.
		await env.db.prepare('UPDATE account SET status = 1 WHERE account_id = ?')
			.bind(alice.accountId).run();
		try {
			const disabled = await json(await api('/api/email/send', {
				token: alice.token, method: 'POST', body: { ...base, accountId: alice.accountId },
			}));
			expect(disabled.code).toBe(403);
		} finally {
			await env.db.prepare('UPDATE account SET status = 0 WHERE account_id = ?')
				.bind(alice.accountId).run();
		}
	});

	it('refuses an address the caller’s role may not send from', async () => {
		await openSend();
		const restrictedRole = await createRole({ availDomain: 'other.example' });
		const carol = await sessionFor(await createAccount(uniqueEmail('carol-send'), { roleId: restrictedRole }));
		const recipient = await sessionFor(await createAccount());

		const response = await json(await api('/api/email/send', {
			token: carol.token, method: 'POST',
			body: {
				accountId: carol.accountId, receiveEmail: [recipient.email],
				subject: `restricted-${Date.now()}`, content: 'x', text: 'x', sendType: '', attachments: [],
			},
		}));
		expect(response.code).toBe(403);
	});

	it('still delivers internally through the shared send path', async () => {
		await openSend();
		const alice = await createSender(uniqueEmail('alice-internal'));
		const recipient = await sessionFor(await createAccount());
		const alias = await addAddress(alice, uniqueEmail('alice-internal-alias'));
		await setDefault(alice, alias.accountId);

		const subject = `internal-default-${Date.now()}`;
		const body = await json(await api('/api/email/send', {
			token: alice.token, method: 'POST',
			body: {
				accountId: alias.accountId, receiveEmail: [recipient.email],
				subject, content: '<p>hi</p>', text: 'hi', sendType: '', attachments: [],
			},
		}));
		expect(body.code).toBe(200);

		const received = await env.db
			.prepare('SELECT send_email, status FROM email WHERE subject = ? AND type = ?')
			.bind(subject, emailConst.type.RECEIVE).first();
		expect(received.send_email).toBe(alias.email);
		expect(received.status).not.toBe(emailConst.status.FAILED);
	});

	it('keeps the global send switch authoritative', async () => {
		await openSend();
		const alice = await createSender(uniqueEmail('alice-switch'));
		const recipient = await sessionFor(await createAccount());

		await updateSetting({ send: settingConst.send.CLOSE });		try {
			const blocked = await json(await api('/api/email/send', {
				token: alice.token, method: 'POST',
				body: {
					accountId: alice.accountId, receiveEmail: [recipient.email],
					subject: 'blocked', content: 'x', text: 'x', sendType: '', attachments: [],
				},
			}));
			expect(blocked.code).toBe(403);
		} finally {
			await openSend();
		}
	});
});
