import { describe, expect, it } from 'vitest';
import { normalizeAttachment, normalizeAttachmentFilename, safeMessageId, validateOutgoingMail } from '../src/utils/outgoing-mail-validation';

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
		const attachment = normalizeAttachment({ filename: '../../folder\\file.txt', contentType: 'application/octet-stream', content: 'c2FmZQ==' });
		expect(attachment.filename).toBe('file.txt');
	});
});
