import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { emailConst, isDel } from '../../src/const/entity-const';
import emailService from '../../src/service/email-service';
import { api, context, createAccount, json, sessionFor } from './helpers';

/**
 * Conversation deletion regressions.
 *
 * A message's Trash / soft-delete state belongs to that message. Conversation
 * reconstruction (subject fallback, inbound thread resolution, the reader's
 * cache) must never bring a hidden message back, and inbound processing must
 * never rewrite the mailbox state of the messages already stored.
 */

const SENDER = 'sender@outside.example';

/** Persist an inbound message through the real receive pipeline. */
async function receive(c, principal, {
	subject,
	messageId,
	inReplyTo = '',
	references = '',
	from = SENDER,
} = {}) {
	return emailService.receive(c, {
		toEmail: principal.email,
		toName: '',
		sendEmail: from,
		name: 'Sender',
		subject,
		code: '',
		content: '',
		text: 'body',
		bodyType: 'text/plain',
		cc: '[]',
		bcc: '[]',
		recipient: JSON.stringify([{ address: principal.email, name: '' }]),
		inReplyTo,
		relation: references,
		messageId,
		authResults: '',
		bimiSelector: '',
		userId: principal.userId,
		accountId: principal.accountId,
		type: emailConst.type.RECEIVE,
		status: emailConst.status.RECEIVE,
		isDel: isDel.NORMAL,
	}, [], null);
}

async function threadIds(principal, emailId) {
	const body = await json(await api(
		`/api/email/thread?emailId=${emailId}&accountId=${principal.accountId}`,
		{ token: principal.token },
	));
	expect(body.code).toBe(200);
	return body.data.messages.map(message => message.emailId);
}

async function inboxIds(principal) {
	const body = await json(await api(
		`/api/email/list?accountId=${principal.accountId}&type=0&size=50`,
		{ token: principal.token },
	));
	expect(body.code).toBe(200);
	return body.data.list.map(message => message.emailId);
}

async function trashSubjects(principal) {
	const body = await json(await api(
		`/api/email/list?accountId=${principal.accountId}&type=all&size=50&trashed=1`,
		{ token: principal.token },
	));
	expect(body.code).toBe(200);
	return body.data.list.map(message => message.subject);
}

async function storedRow(emailId) {
	return env.db
		.prepare('SELECT email_id, thread_id, is_del, trashed, archived FROM email WHERE email_id = ?')
		.bind(emailId)
		.first();
}

async function trash(principal, emailIds) {
	return json(await api(`/api/email/delete?emailIds=${[].concat(emailIds).join(',')}`, {
		method: 'DELETE',
		token: principal.token,
	}));
}

async function restore(principal, emailIds) {
	return json(await api('/api/email/restore', {
		method: 'PUT',
		token: principal.token,
		body: { emailIds: [].concat(emailIds) },
	}));
}

describe('conversation deletion', () => {
	it('does not resurrect a deleted message when a later same-subject mail arrives', async () => {
		const c = context();
		const principal = await sessionFor(await createAccount());

		const first = await receive(c, principal, { subject: 'Test', messageId: '<del-1@x>' });
		expect(await trash(principal, first.emailId)).toMatchObject({ code: 200 });
		expect((await storedRow(first.emailId)).trashed).toBe(1);

		const second = await receive(c, principal, { subject: 'Test', messageId: '<del-2@x>' });

		// The new conversation contains only the new message.
		expect(await threadIds(principal, second.emailId)).toEqual([second.emailId]);
		expect(await inboxIds(principal)).toEqual([second.emailId]);
		// The deleted one is still deleted and was not moved into the new thread.
		expect((await storedRow(first.emailId)).trashed).toBe(1);
		expect(await trashSubjects(principal)).toContain('Test');
	});

	it('keeps a deleted middle message hidden and shows the surviving conversation', async () => {
		const c = context();
		const principal = await sessionFor(await createAccount());

		const a = await receive(c, principal, { subject: 'Project', messageId: '<p-a@x>' });
		const b = await receive(c, principal, { subject: 'Re: Project', messageId: '<p-b@x>', inReplyTo: '<p-a@x>' });
		const cc = await receive(c, principal, { subject: 'Re: Project', messageId: '<p-c@x>', inReplyTo: '<p-b@x>' });
		expect(new Set([a.threadId, b.threadId, cc.threadId]).size).toBe(1);

		await trash(principal, b.emailId);
		expect((await storedRow(a.emailId)).trashed).toBe(0);
		expect((await storedRow(cc.emailId)).trashed).toBe(0);

		// A later reply joins the conversation but never revives the deleted one.
		const d = await receive(c, principal, { subject: 'Re: Project', messageId: '<p-d@x>', inReplyTo: '<p-c@x>' });

		expect(await threadIds(principal, d.emailId)).toEqual([a.emailId, cc.emailId, d.emailId]);
		expect(await trashSubjects(principal)).toContain('Re: Project');
	});

	it('restores a message back into its conversation', async () => {
		const c = context();
		const principal = await sessionFor(await createAccount());

		const a = await receive(c, principal, { subject: 'Release', messageId: '<r-a@x>' });
		const b = await receive(c, principal, { subject: 'Re: Release', messageId: '<r-b@x>', inReplyTo: '<r-a@x>' });

		await trash(principal, b.emailId);
		expect(await threadIds(principal, a.emailId)).toEqual([a.emailId]);

		await restore(principal, b.emailId);

		expect((await storedRow(b.emailId)).trashed).toBe(0);
		expect(await threadIds(principal, a.emailId)).toEqual([a.emailId, b.emailId]);
	});

	it('never reconstructs a permanently deleted message', async () => {
		const c = context();
		const principal = await sessionFor(await createAccount());

		const a = await receive(c, principal, { subject: 'Invoice', messageId: '<i-a@x>' });
		const b = await receive(c, principal, { subject: 'Re: Invoice', messageId: '<i-b@x>', inReplyTo: '<i-a@x>' });

		await trash(principal, b.emailId);
		await json(await api(`/api/email/trash/delete?emailIds=${b.emailId}`, {
			method: 'DELETE',
			token: principal.token,
		}));
		expect(await storedRow(b.emailId)).toBeNull();

		// Even a reply that references the removed message cannot rebuild it.
		const reply = await receive(c, principal, { subject: 'Re: Invoice', messageId: '<i-c@x>', inReplyTo: '<i-b@x>' });
		expect(await threadIds(principal, reply.emailId)).toEqual([a.emailId, reply.emailId]);
		expect(await storedRow(b.emailId)).toBeNull();
	});

	it('keeps unrelated identical subjects apart and does not revive a deleted one', async () => {
		const c = context();
		const principal = await sessionFor(await createAccount());

		const deleted = await receive(c, principal, { subject: 'Hello', messageId: '<h-1@x>', from: 'one@shop.example' });
		await trash(principal, deleted.emailId);

		const stranger = await receive(c, principal, { subject: 'Hello', messageId: '<h-2@x>', from: 'two@shop.example' });
		expect(await threadIds(principal, stranger.emailId)).toEqual([stranger.emailId]);

		// Two live mails that only share a subject and the owner's own address
		// are not evidence of one conversation.
		const liveOne = await receive(c, principal, { subject: 'Greetings', messageId: '<g-1@x>', from: 'three@shop.example' });
		const liveTwo = await receive(c, principal, { subject: 'Greetings', messageId: '<g-2@x>', from: 'four@shop.example' });
		expect(liveOne.threadId).not.toBe(liveTwo.threadId);
		expect(await threadIds(principal, liveTwo.emailId)).toEqual([liveTwo.emailId]);

		// A genuine same-correspondent reply still joins by subject fallback.
		const root = await receive(c, principal, { subject: 'Ping', messageId: '<pi-1@x>', from: 'five@shop.example' });
		const reply = await receive(c, principal, { subject: 'Re: Ping', messageId: '<pi-2@x>', from: 'five@shop.example' });
		expect(reply.threadId).toBe(root.threadId);
	});

	it('does not change deletion state when the subject is normalised as Re:/Fwd:', async () => {
		const c = context();
		const principal = await sessionFor(await createAccount());

		const first = await receive(c, principal, { subject: 'Status', messageId: '<s-1@x>' });
		await trash(principal, first.emailId);

		const reply = await receive(c, principal, { subject: 'Fwd: Re: Status', messageId: '<s-2@x>' });
		expect((await storedRow(first.emailId)).trashed).toBe(1);
		expect(await threadIds(principal, reply.emailId)).toEqual([reply.emailId]);
	});

	it('never rewrites the mailbox state of existing messages while receiving', async () => {
		const c = context();
		const principal = await sessionFor(await createAccount());

		const existing = await receive(c, principal, { subject: 'Keep state', messageId: '<k-1@x>' });
		const before = await storedRow(existing.emailId);

		const reply = await receive(c, principal, { subject: 'Re: Keep state', messageId: '<k-2@x>', inReplyTo: '<k-1@x>' });
		expect(reply.threadId).toBe(existing.threadId);

		const after = await storedRow(existing.emailId);
		expect(after).toEqual(before);
		expect(after.trashed).toBe(0);
		expect(after.is_del).toBe(0);
	});
});
