import { describe, it, expect } from 'vitest';
import {
	MAIL_BODY,
	bodyViewFor,
	decodePartContent,
	isMarkdownPart,
	partMimeType,
	resolveMailBody,
} from '../src/lib/mail-body.js';

const encoder = new TextEncoder();

function markdownPart(markdown, filename = 'body.md') {
	return {
		filename,
		mimeType: 'text/markdown',
		content: encoder.encode(markdown).buffer,
	};
}

describe('mail body resolution', () => {
	it('prefers html when the mail carries both html and text (multipart/alternative)', () => {
		const parsed = {
			html: '<p>Hello <b>world</b></p>',
			text: 'Hello world',
			attachments: [],
		};

		const body = resolveMailBody(parsed);

		expect(body.bodyType).toBe(MAIL_BODY.HTML);
		expect(body.markdownPart).toBe(null);
	});

	it('falls back to plain text when there is no html part', () => {
		const body = resolveMailBody({ text: 'just text', attachments: [] });

		expect(body.bodyType).toBe(MAIL_BODY.PLAIN);
		expect(body.text).toBe('just text');
	});

	it('treats a text/markdown part as the body, not as an attachment', () => {
		const part = markdownPart('# Title\n\n**bold**');
		const body = resolveMailBody({ text: '', html: '', attachments: [part] });

		expect(body.bodyType).toBe(MAIL_BODY.MARKDOWN);
		expect(body.markdown).toContain('**bold**');
		// The caller must be able to drop it from the attachment list.
		expect(body.markdownPart).toBe(part);
	});

	it('html still wins over a markdown part', () => {
		const body = resolveMailBody({
			html: '<p>html</p>',
			attachments: [markdownPart('# md')],
		});

		expect(body.bodyType).toBe(MAIL_BODY.HTML);
		expect(body.markdownPart).toBe(null);
	});

	it('ignores an empty markdown part and keeps the plain text body', () => {
		const part = markdownPart('   \n  ', 'empty.md');
		const body = resolveMailBody({ text: 'real body', attachments: [part] });

		expect(body.bodyType).toBe(MAIL_BODY.PLAIN);
		expect(body.text).toBe('real body');
		// Nothing markdown was used, so the part stays a normal attachment.
		expect(body.markdownPart).toBe(null);
	});

	it('returns an empty body type for a malformed, body-less mail', () => {
		expect(resolveMailBody({}).bodyType).toBe('');
		expect(resolveMailBody(null).bodyType).toBe('');
		expect(resolveMailBody({ html: '   ', text: '\n', attachments: 'nope' }).bodyType).toBe('');
	});

	it('survives a huge body without truncating it', () => {
		const huge = 'x'.repeat(2 * 1024 * 1024);
		const body = resolveMailBody({ text: huge });

		expect(body.bodyType).toBe(MAIL_BODY.PLAIN);
		expect(body.text.length).toBe(huge.length);
	});

	it('does not treat other text subtypes as the markdown body', () => {
		for (const mimeType of ['text/plain', 'text/x-markdown', 'application/markdown', 'text/markdown-extra']) {
			const parsed = {
				text: 'plain',
				attachments: [{ filename: 'a.txt', mimeType, content: encoder.encode('# md').buffer }],
			};
			expect(resolveMailBody(parsed).bodyType).toBe(MAIL_BODY.PLAIN);
		}
	});

	it('tolerates a markdown part whose content is missing', () => {
		const body = resolveMailBody({
			text: 'fallback',
			attachments: [{ filename: 'body.md', mimeType: 'text/markdown' }],
		});

		expect(body.bodyType).toBe(MAIL_BODY.PLAIN);
		expect(body.text).toBe('fallback');
	});
});

describe('bodyViewFor', () => {
	it('hides html from the blacklist / code extractor when the body is markdown', () => {
		const parsed = { subject: 'Verify', html: '<p>secret</p>', text: '# code 123456' };
		const body = resolveMailBody({
			subject: 'Verify',
			html: '',
			text: '',
			attachments: [markdownPart('# code 123456')],
		});

		const view = bodyViewFor(parsed, body);

		expect(view.subject).toBe('Verify');
		expect(view.html).toBe('');
		expect(view.text).toContain('123456');
	});

	it('passes html through for an html body', () => {
		const parsed = { html: '<p>hi</p>', text: 'hi' };
		const view = bodyViewFor(parsed, resolveMailBody(parsed));

		expect(view.html).toBe('<p>hi</p>');
	});
});

describe('part helpers', () => {
	it('decodes ArrayBuffer, typed array and string content', () => {
		expect(decodePartContent(encoder.encode('abc').buffer)).toBe('abc');
		expect(decodePartContent(encoder.encode('abc'))).toBe('abc');
		expect(decodePartContent('abc')).toBe('abc');
		expect(decodePartContent(undefined)).toBe('');
	});

	it('normalises the mime type (case, parameters, spacing)', () => {
		expect(partMimeType({ mimeType: ' Text/Markdown ; charset=utf-8' })).toBe('text/markdown');
		expect(partMimeType({})).toBe('');
		expect(partMimeType(null)).toBe('');
	});

	it('detects markdown parts only', () => {
		expect(isMarkdownPart({ mimeType: 'text/markdown' })).toBe(true);
		expect(isMarkdownPart({ mimeType: 'text/plain' })).toBe(false);
	});
});
