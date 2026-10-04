import { describe, expect, it } from 'vitest';
import { contentDisposition, normalizeAttachment, normalizeAttachmentFilename, normalizeRecipientLists, safeMessageId, validateOutgoingMail } from '../src/utils/outgoing-mail-validation';
import { MAIL_LIMITS } from '../src/const/mail-limits';

const validMessage = {
	receiveEmail: ['person@example.net'],
	name: 'Sender',
	subject: 'Hello',
	text: 'plain text',
	content: '<p>HTML</p>',
	attachments: [{ filename: 'report.pdf', contentType: 'application/pdf', content: 'c2FmZQ==' }]
};

describe('outgoing mail validation', () => {
	it('accepts normal mail while normalizing untrusted attachment metadata', () => {
		const message = validateOutgoingMail(validMessage);
		expect(message.receiveEmail).toEqual(['person@example.net']);
		expect(message.attachments[0]).toMatchObject({ filename: 'report.pdf', mimeType: 'application/pdf', type: 'application/pdf', content: 'c2FmZQ==' });
		expect(normalizeAttachmentFilename('../../Windows\\report.pdf')).toBe('report.pdf');
	});

	it('keeps To, then Cc, then Bcc while deduplicating addresses across fields', () => {
		const recipients = normalizeRecipientLists({
			receiveEmail: ['to@example.net', 'shared@example.net'],
			cc: ['SHARED@example.net', 'cc@example.net'],
			bcc: ['CC@example.net', 'bcc@example.net'],
		});
		expect(recipients).toEqual({
			receiveEmail: ['to@example.net', 'shared@example.net'],
			cc: ['cc@example.net'],
			bcc: ['bcc@example.net'],
		});
	});

	it('caps the combined submitted recipient count before recipient normalization', () => {
		const addresses = Array.from({ length: MAIL_LIMITS.MAX_RECIPIENTS_PER_MESSAGE }, (_, index) => `r${index}@example.net`);
		expect(() => normalizeRecipientLists({ receiveEmail: addresses.slice(0, 20), cc: addresses.slice(20, 35), bcc: addresses.slice(35) })).not.toThrow();
		expect(() => normalizeRecipientLists({ receiveEmail: [...addresses, 'one-more@example.net'] })).toThrow('Too many recipients');
	});

	it.each([
		[{ receiveEmail: ['to@example.net'] }, { receiveEmail: ['to@example.net'], cc: [], bcc: [] }],
		[{ receiveEmail: ['to@example.net'], cc: ['cc@example.net'] }, { receiveEmail: ['to@example.net'], cc: ['cc@example.net'], bcc: [] }],
		[{ receiveEmail: ['to@example.net'], bcc: ['bcc@example.net'] }, { receiveEmail: ['to@example.net'], cc: [], bcc: ['bcc@example.net'] }],
		[{ receiveEmail: ['to@example.net'], cc: ['cc@example.net'], bcc: ['bcc@example.net'] }, { receiveEmail: ['to@example.net'], cc: ['cc@example.net'], bcc: ['bcc@example.net'] }],
	])('normalizes recipient combination %#', (input, expected) => {
		expect(normalizeRecipientLists(input)).toEqual(expected);
	});

	it('rejects invalid Cc or Bcc recipients', () => {
		expect(() => validateOutgoingMail({ ...validMessage, cc: ['not-an-address'] })).toThrow('Invalid recipient address');
		expect(() => validateOutgoingMail({ ...validMessage, bcc: ['victim@example.net\\r\\nBcc: attacker@example.net'] })).toThrow('Invalid recipient address');
	});

	it('rejects CRLF/NUL header injection in recipients, sender names, subjects, filenames, MIME types, and reply references', () => {
		for (const mutation of [
			{ receiveEmail: ['victim@example.net\r\nBcc: attacker@example.net'] },
			{ name: 'Sender\nBcc: attacker@example.net' },
			{ subject: 'Hello\r\nBcc: attacker@example.net' },
			{ attachments: [{ filename: 'good.pdf\0bad', content: 'c2FmZQ==', contentType: 'application/pdf' }] },
			{ attachments: [{ filename: 'good.pdf', content: 'c2FmZQ==', contentType: 'text/plain\r\nX-Evil: yes' }] }
		]) {
			expect(() => validateOutgoingMail({ ...validMessage, ...mutation })).toThrow();
		}
		expect(safeMessageId('<ok@example.net>\r\nBcc: attacker@example.net')).toBeNull();
	});

	it('rejects malformed base64 and leaves no path or header syntax in attachment metadata', () => {
		expect(() => normalizeAttachment({ filename: '../../file\r\nX: y', contentType: 'application/pdf', content: 'c2FmZQ==' })).toThrow();
		expect(() => normalizeAttachment({ filename: 'file.txt', contentType: 'text/plain', content: 'not base64!' })).toThrow();
		expect(() => normalizeAttachment({ filename: 'active.svg', contentType: 'image/svg+xml', contentId: 'cid1', content: 'c2FmZQ==' })).toThrow('Unsafe inline');
		const attachment = normalizeAttachment({ filename: '../../folder\\file.txt', contentType: 'application/octet-stream', content: 'c2FmZQ==' });
		expect(attachment.filename).toBe('file.txt');
		expect(contentDisposition('evil"; inline.txt')).toContain("filename*=UTF-8''evil%22%3B%20inline.txt");
	});
});
