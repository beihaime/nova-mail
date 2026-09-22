import { describe, expect, it } from 'vitest';
import { assertAttachmentLimits, assertEncodedAttachmentLimit, assertOutboundMailLimits, MAIL_LIMITS, readLimitedJson } from '../src/const/mail-limits';
import { validateOutgoingMail } from '../src/utils/outgoing-mail-validation';

describe('server-side mail resource limits', () => {
	it('accepts a normal message and attachment', () => {
		expect(() => validateOutgoingMail({ receiveEmail: ['person@example.net'], subject: 'Normal', text: 'hello', content: '<p>hello</p>', attachments: [{ filename: 'note.txt', contentType: 'text/plain', content: 'aGVsbG8=' }] })).not.toThrow();
	});

	it('rejects individual and total attachment overages before decoding', () => {
		const encodedOverage = 'A'.repeat(Math.ceil(MAIL_LIMITS.MAX_ATTACHMENT_BYTES / 3) * 4 + 4);
		expect(() => assertEncodedAttachmentLimit(encodedOverage)).toThrow('Attachment exceeds');
		const nineMiB = new Uint8Array(9 * 1024 * 1024);
		expect(() => assertAttachmentLimits([{ content: nineMiB }, { content: nineMiB }, { content: nineMiB }])).toThrow('Total attachment');
	});

	it('rejects too many attachments and oversized bodies', () => {
		expect(() => assertAttachmentLimits(Array.from({ length: MAIL_LIMITS.MAX_ATTACHMENT_COUNT + 1 }, () => ({ content: new Uint8Array(1) })))).toThrow('Too many');
		expect(() => assertOutboundMailLimits({ text: 'x'.repeat(MAIL_LIMITS.MAX_OUTBOUND_BODY_BYTES + 1), content: '', attachments: [] })).toThrow('Message body');
	});

	it('stops an oversized JSON request while reading the request stream', async () => {
		const encoded = new TextEncoder().encode('{"subject":"this is too long"}');
		const stream = new ReadableStream({ start(controller) { controller.enqueue(encoded); controller.close(); } });
		const context = { req: { header: () => undefined, raw: new Request('https://nova.test/api/email/send', { method: 'POST', body: stream, duplex: 'half' }) } };
		await expect(readLimitedJson(context, 8)).rejects.toThrow('Request payload exceeds');
	});
});
