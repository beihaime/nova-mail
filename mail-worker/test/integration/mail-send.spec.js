import { beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { emailConst, settingConst } from '../../src/const/entity-const';
import emailService from '../../src/service/email-service';
import { api, context, createAccount, createAdmin, openSend, sessionFor, updateSetting } from './helpers';

/**
 * Critical path: sending and receiving.
 *
 * A send between two accounts on the configured domain never leaves the Worker
 * — it is persisted and fanned out to the recipient's mailbox on-site — so the
 * whole journey can be asserted end to end, without mocking a mail provider.
 */
describe('outbound mail', () => {
	let admin;
	let recipient;
	let secondRecipient;
	let ccRecipient;
	let bccRecipient;

	beforeAll(async () => {
		await openSend();
		admin = await sessionFor(await createAdmin());
		recipient = await sessionFor(await createAccount());
		secondRecipient = await sessionFor(await createAccount());
		ccRecipient = await sessionFor(await createAccount());
		bccRecipient = await sessionFor(await createAccount());
	});

	it('stores the sent copy and delivers it to the recipient', async () => {
		const subject = `intern-${Date.now()}`;
		const response = await api('/api/email/send', {
			method: 'POST',
			token: admin.token,
			body: {
				accountId: admin.accountId,
				receiveEmail: [recipient.email],
				subject,
				content: '<p>hello</p>',
				text: 'hello',
				sendType: '',
				attachments: [],
			},
		});
		const body = await response.json();

		expect(body.code).toBe(200);
		expect(Array.isArray(body.data)).toBe(true);
		const sent = body.data[0];
		expect(sent.subject).toBe(subject);
		expect(sent.type).toBe(emailConst.type.SEND);
		// Every message carries a conversation key.
		expect(sent.threadId).toBeTruthy();

		// The row the API returns is written before on-site fan-out, so the
		// definitive status is read back: delivery flips the sender's copy from
		// SENT to DELIVERED.
		const stored = await env.db
			.prepare('SELECT status FROM email WHERE email_id = ?')
			.bind(sent.emailId)
			.first();
		expect(stored.status).toBe(emailConst.status.DELIVERED);

		const recipientList = await api(
			`/api/email/list?accountId=${recipient.accountId}&type=0&size=20`,
			{ token: recipient.token },
		);
		const inbox = (await recipientList.json()).data;
		const received = inbox.list.find((row) => row.subject === subject);

		expect(received).toBeTruthy();
		expect(received.type).toBe(emailConst.type.RECEIVE);
		expect(received.unread).toBe(emailConst.unread.UNREAD);

		const senderList = await api(
			`/api/email/list?accountId=${admin.accountId}&type=1&size=20`,
			{ token: admin.token },
		);
		expect((await senderList.json()).data.list.map((row) => row.subject)).toContain(subject);
	});

	it('delivers To, Cc, and Bcc internally, deduplicates them, and keeps Bcc private', async () => {
		const subject = `internal-cc-bcc-${Date.now()}`;
		const response = await api('/api/email/send', {
			method: 'POST', token: admin.token,
			body: {
				accountId: admin.accountId,
				receiveEmail: [recipient.email, secondRecipient.email],
				cc: [secondRecipient.email.toUpperCase(), ccRecipient.email],
				bcc: [ccRecipient.email.toUpperCase(), bccRecipient.email],
				subject, content: '<p>hello</p>', text: 'hello', sendType: '', attachments: [],
			},
		});
		const body = await response.json();
		expect(body.code).toBe(200);

		const sent = await env.db.prepare('SELECT cc, bcc FROM email WHERE email_id = ?').bind(body.data[0].emailId).first();
		expect(JSON.parse(sent.cc).map(item => item.address)).toEqual([ccRecipient.email]);
		expect(JSON.parse(sent.bcc).map(item => item.address)).toEqual([bccRecipient.email]);

		const copies = await env.db.prepare('SELECT to_email, cc, bcc FROM email WHERE subject = ? AND type = ?')
			.bind(subject, emailConst.type.RECEIVE).all();
		expect(copies.results.map(row => row.to_email).sort()).toEqual([recipient.email, secondRecipient.email, ccRecipient.email, bccRecipient.email].sort());
		for (const copy of copies.results) {
			expect(copy.bcc).toBe('[]');
			expect(JSON.parse(copy.cc).map(item => item.address)).toEqual([ccRecipient.email]);
		}
	});

	it('keeps multiple To, reply, forward, and attachment sends working', async () => {
		const subject = `to-regression-${Date.now()}`;
		const send = (body) => api('/api/email/send', { method: 'POST', token: admin.token, body });
		const base = { accountId: admin.accountId, content: '<p>body</p>', text: 'body', attachments: [] };
		const multi = await send({ ...base, receiveEmail: [recipient.email, secondRecipient.email], subject, sendType: '' });
		expect((await multi.json()).code).toBe(200);

		const original = await env.db.prepare('SELECT email_id FROM email WHERE subject = ? AND type = ?').bind(subject, emailConst.type.SEND).first();
		const reply = await send({ ...base, receiveEmail: [recipient.email], subject: `Re: ${subject}`, sendType: 'reply', emailId: original.email_id });
		expect((await reply.json()).code).toBe(200);
		const forward = await send({ ...base, receiveEmail: [recipient.email], subject: `Fwd: ${subject}`, sendType: 'forward' });
		expect((await forward.json()).code).toBe(200);
		const attachment = await send({ ...base, receiveEmail: [recipient.email], subject: `${subject}-attachment`, attachments: [{ filename: 'note.txt', contentType: 'text/plain', content: 'aGVsbG8=' }], sendType: '' });
		const attachmentBody = await attachment.json();
		expect(attachmentBody.code).toBe(200);
		const stored = await env.db.prepare('SELECT COUNT(*) AS total FROM attachments WHERE email_id = ?').bind(attachmentBody.data[0].emailId).first();
		expect(stored.total).toBe(1);
	});

	it('refuses to send when the feature switch is closed', async () => {
		await updateSetting({ send: settingConst.send.CLOSE });
		try {
			const response = await api('/api/email/send', {
				method: 'POST',
				token: admin.token,
				body: {
					accountId: admin.accountId,
					receiveEmail: [recipient.email],
					subject: 'should-not-send',
					content: '<p>x</p>',
					text: 'x',
					sendType: '',
					attachments: [],
				},
			});
			expect((await response.json()).code).toBe(403);
		} finally {
			await openSend();
		}
	});

	it('refuses to send from an account the caller does not own', async () => {
		const outsider = await sessionFor(await createAccount());
		const response = await api('/api/email/send', {
			method: 'POST',
			token: outsider.token,
			body: {
				accountId: admin.accountId,
				receiveEmail: [recipient.email],
				subject: 'spoofed-sender',
				content: '<p>x</p>',
				text: 'x',
				sendType: '',
				attachments: [],
			},
		});

		// The account belongs to the admin; a regular user may not send as them.
		expect((await response.json()).code).not.toBe(200);
	});

	it('atomically reserves the final recipient quota and replays one idempotent send', async () => {
		const sender = await sessionFor(await createAccount());
		const target = await sessionFor(await createAccount());
		const original = await env.db.prepare('SELECT send_count, send_type FROM role WHERE role_id = 1').first();
		try {
			await env.db.batch([
				env.db.prepare("UPDATE role SET send_count = 1, send_type = 'count' WHERE role_id = 1"),
				env.db.prepare('UPDATE user SET send_count = 0 WHERE user_id = ?').bind(sender.userId),
			]);
			const message = (key, subject) => ({
				accountId: sender.accountId, receiveEmail: [target.email], subject, content: '<p>one</p>', text: 'one', sendType: '', attachments: [], idempotencyKey: key,
			});
			const [first, second] = await Promise.all([
				api('/api/email/send', { method: 'POST', token: sender.token, body: message('quota-send-a', 'quota A') }),
				api('/api/email/send', { method: 'POST', token: sender.token, body: message('quota-send-b', 'quota B') }),
			]);
			const outcomes = [await first.json(), await second.json()];
			expect(outcomes.filter(result => result.code === 200)).toHaveLength(1);
			expect(await env.db.prepare('SELECT send_count FROM user WHERE user_id = ?').bind(sender.userId).first())
				.toMatchObject({ send_count: 1 });

			const accepted = outcomes.find(result => result.code === 200).data[0];
			const replay = await api('/api/email/send', { method: 'POST', token: sender.token, body: message(accepted.subject === 'quota A' ? 'quota-send-a' : 'quota-send-b', accepted.subject) });
			expect((await replay.json()).data[0].emailId).toBe(accepted.emailId);
			const rows = await env.db.prepare('SELECT count(*) AS total FROM email WHERE user_id = ? AND type = ?').bind(sender.userId, emailConst.type.SEND).first();
			expect(rows.total).toBe(1);
		} finally {
			await env.db.prepare('UPDATE role SET send_count = ?, send_type = ? WHERE role_id = 1').bind(original.send_count, original.send_type).run();
		}
	});

	it('does not reserve quota or invoke delivery when the combined recipient cap is exceeded', async () => {
		const sender = await sessionFor(await createAccount());
		const recipients = Array.from({ length: 51 }, (_, index) => `cap-${index}@outside.example`);
		const before = await env.db.prepare('SELECT send_count FROM user WHERE user_id = ?').bind(sender.userId).first();
		const response = await api('/api/email/send', {
			method: 'POST', token: sender.token,
			body: { accountId: sender.accountId, receiveEmail: recipients.slice(0, 20), cc: recipients.slice(20, 35), bcc: recipients.slice(35), subject: 'too many', content: '', text: 'x', sendType: '', attachments: [], idempotencyKey: 'recipient-cap-over-limit' },
		});
		expect((await response.json()).code).not.toBe(200);
		expect(await env.db.prepare('SELECT count(*) AS total FROM outbound_send WHERE user_id = ?').bind(sender.userId).first())
			.toMatchObject({ total: 0 });
		expect(await env.db.prepare('SELECT send_count FROM user WHERE user_id = ?').bind(sender.userId).first())
			.toEqual(before);
	});

	it('finalizes a provider-accepted send on retry without delivering twice', async () => {
		const sender = await createAdmin();
		const provider = { send: vi.fn(async () => ({ messageId: `provider-${Date.now()}` })) };
		let failFinalization = true;
		const c = context();
		c.env = { ...env, email: provider };
		c.testHooks = { beforeSendFinalization: async () => {
			if (failFinalization) {
				failFinalization = false;
				throw new Error('forced post-provider finalization failure');
			}
		} };
		const params = {
			accountId: sender.accountId, receiveEmail: ['external-recipient@outside.example'],
			subject: `finalize-retry-${Date.now()}`, content: '<p>body</p>', text: 'body', sendType: '', attachments: [], idempotencyKey: 'provider-finalize-retry',
		};
		await expect(emailService.send(c, params, sender.userId)).rejects.toThrow('forced post-provider finalization failure');
		expect(provider.send).toHaveBeenCalledTimes(1);
		const retry = await emailService.send(c, params, sender.userId);
		expect(provider.send).toHaveBeenCalledTimes(1);
		expect(retry[0].subject).toBe(params.subject);
		expect(await env.db.prepare('SELECT count(*) AS total FROM email WHERE send_operation_id = ?').bind(
			(await env.db.prepare('SELECT operation_id FROM outbound_send WHERE user_id = ? AND request_key = ?').bind(sender.userId, params.idempotencyKey).first()).operation_id,
		).first()).toMatchObject({ total: 1 });
	});

	it('keeps a same-key retry pending while provider delivery is in progress', async () => {
		const sender = await createAdmin();
		let release;
		const provider = { send: vi.fn(() => new Promise(resolve => { release = resolve; })) };
		const c = context();
		c.env = { ...env, email: provider };
		const params = {
			accountId: sender.accountId, receiveEmail: ['pending-recipient@outside.example'],
			subject: `pending-${Date.now()}`, content: '<p>body</p>', text: 'body', sendType: '', attachments: [], idempotencyKey: 'provider-pending-retry',
		};
		const first = emailService.send(c, params, sender.userId);
		await vi.waitFor(() => expect(provider.send).toHaveBeenCalledTimes(1));
		await expect(emailService.send(c, params, sender.userId)).rejects.toThrow('pending reconciliation');
		release({ messageId: `provider-${Date.now()}` });
		await expect(first).resolves.toHaveLength(1);
		expect(provider.send).toHaveBeenCalledTimes(1);
	});
});

describe('inbound mail', () => {
	it('persists a message and assigns it to a conversation', async () => {
		const principal = await createAccount();
		const messageId = `<inbound-${Date.now()}@outside.example>`;

		const row = await emailService.receive(context(), {
			toEmail: principal.email,
			toName: 'User',
			sendEmail: 'sender@outside.example',
			name: 'Sender',
			subject: 'Inbound',
			content: '',
			text: 'plain body',
			bodyType: 'text/plain',
			code: '',
			cc: '[]',
			bcc: '[]',
			recipient: JSON.stringify([{ address: principal.email, name: '' }]),
			inReplyTo: '',
			relation: '',
			messageId,
			authResults: '',
			userId: principal.userId,
			accountId: principal.accountId,
			isDel: 0,
			status: emailConst.status.RECEIVE,
		}, [], null);

		expect(row.emailId).toBeGreaterThan(0);
		expect(row.threadId).toBeTruthy();
		expect(row.userId).toBe(principal.userId);
	});

	it('deduplicates a redelivered message instead of inserting twice', async () => {
		const principal = await createAccount();
		const messageId = `<redeliver-${Date.now()}@outside.example>`;
		const params = {
			toEmail: principal.email,
			toName: '',
			sendEmail: 'sender@outside.example',
			name: 'Sender',
			subject: 'Retry',
			content: '',
			text: 'body',
			bodyType: 'text/plain',
			code: '',
			cc: '[]',
			bcc: '[]',
			recipient: JSON.stringify([{ address: principal.email, name: '' }]),
			inReplyTo: '',
			relation: '',
			messageId,
			authResults: '',
			userId: principal.userId,
			accountId: principal.accountId,
			isDel: 0,
			status: emailConst.status.RECEIVE,
		};

		const first = await emailService.receive(context(), { ...params }, [], null);
		const second = await emailService.receive(context(), { ...params }, [], null);

		expect(second.emailId).toBe(first.emailId);

		const stored = await env.db
			.prepare('SELECT COUNT(*) AS total FROM email WHERE message_id = ?')
			.bind(messageId)
			.first();
		expect(stored.total).toBe(1);
	});

	it('deduplicates Message-ID per receiving mailbox, not per user', async () => {
		const principal = await createAccount();
		const secondEmail = `second.${Date.now()}@example.com`;
		const second = await env.db.prepare(
			'INSERT INTO account (email, name, user_id, is_del, all_receive) VALUES (?, ?, ?, 0, 0) RETURNING account_id, email'
		).bind(secondEmail, 'second', principal.userId).first();
		const messageId = `<multi-mailbox-${Date.now()}@outside.example>`;
		const base = {
			toName: '', sendEmail: 'sender@outside.example', name: 'Sender', subject: 'One internet message',
			content: '', text: 'body', bodyType: 'text/plain', code: '', cc: '[]', bcc: '[]',
			inReplyTo: '', relation: '', messageId, authResults: '', userId: principal.userId,
			isDel: 0, status: emailConst.status.RECEIVE,
		};
		const first = await emailService.receive(context(), {
			...base, toEmail: principal.email, recipient: JSON.stringify([{ address: principal.email }]), accountId: principal.accountId,
		}, [], null);
		const secondDelivery = await emailService.receive(context(), {
			...base, toEmail: second.email, recipient: JSON.stringify([{ address: second.email }]), accountId: second.account_id,
		}, [], null);
		const repeated = await emailService.receive(context(), {
			...base, toEmail: second.email, recipient: JSON.stringify([{ address: second.email }]), accountId: second.account_id,
		}, [], null);
		expect(repeated.emailId).toBe(secondDelivery.emailId);
		expect(first.emailId).not.toBe(secondDelivery.emailId);
		await env.db.batch([
			env.db.prepare("INSERT INTO attachments (user_id,email_id,account_id,key,type) VALUES (?,?,?,?,0)").bind(principal.userId, first.emailId, principal.accountId, `attachments/a-${Date.now()}`),
			env.db.prepare("INSERT INTO attachments (user_id,email_id,account_id,key,type) VALUES (?,?,?,?,0)").bind(principal.userId, secondDelivery.emailId, second.account_id, `attachments/b-${Date.now()}`),
		]);
		const deliveries = await env.db.prepare('SELECT email_id, account_id FROM email WHERE message_id = ? ORDER BY account_id').bind(messageId).all();
		expect(deliveries.results).toEqual([
			{ email_id: first.emailId, account_id: principal.accountId },
			{ email_id: secondDelivery.emailId, account_id: second.account_id },
		]);
		const attachments = await env.db.prepare('SELECT email_id, account_id FROM attachments WHERE email_id IN (?, ?) ORDER BY email_id').bind(first.emailId, secondDelivery.emailId).all();
		expect(attachments.results).toEqual([
			{ email_id: first.emailId, account_id: principal.accountId },
			{ email_id: secondDelivery.emailId, account_id: second.account_id },
		]);
	});
});
