import { beforeAll, describe, expect, it } from 'vitest';
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

	beforeAll(async () => {
		await openSend();
		admin = await sessionFor(await createAdmin());
		recipient = await sessionFor(await createAccount());
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
});
