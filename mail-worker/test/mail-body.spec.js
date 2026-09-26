import { describe, it, expect } from 'vitest';
import {
	MAIL_BODY,
	bodyViewFor,
	decodePartContent,
	isMarkdownPart,
	looksLikeHtmlDocument,
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

describe('markup that arrives in the text part', () => {
	// Senders that omit Content-Type (or label an HTML body text/plain) leave the
	// markup in `text`; storing that as plain text is what made the reader show
	// visible HTML source.
	const DOC = '<html><body><h1>Hello</h1><p>This is HTML mail.</p></body></html>'

	it('treats a whole HTML document in the text part as the HTML body', () => {
		const body = resolveMailBody({ text: DOC });

		expect(body.bodyType).toBe(MAIL_BODY.HTML);
		expect(body.html).toBe(DOC);
	});

	it('treats an <html> fragment without a doctype the same way', () => {
		expect(resolveMailBody({ text: '<html><body>hi</body></html>' }).bodyType).toBe(MAIL_BODY.HTML);
	});

	it('treats a tag-rich fragment as markup', () => {
		const body = resolveMailBody({ text: '<div><p>a</p><table><tr><td>b</td></tr></table></div>' });

		expect(body.bodyType).toBe(MAIL_BODY.HTML);
		expect(body.html).toContain('<table>');
	});

	it('still treats prose that merely mentions a tag as plain text', () => {
		for (const prose of [
			'Use <b> for bold in HTML.',
			'Compare a < b and c > d, e.g. 3 < 4.',
			'See <a href="x">this</a> link.',
		]) {
			expect(resolveMailBody({ text: prose }).bodyType, prose).toBe(MAIL_BODY.PLAIN);
		}
	});

	it('treats a short HTML body (only one or two tags) as markup', () => {
		for (const fragment of [
			'<p>Hello world</p>',
			'<div>Only one div</div>',
			'Line one<br>Line two',
			'<img src="https://example.com/a.png" alt="logo">',
		]) {
			expect(resolveMailBody({ text: fragment }).bodyType, fragment).toBe(MAIL_BODY.HTML);
		}
	});

	it('unwraps a body that is itself a raw message (headers + blank line)', () => {
		const raw = 'MIME-Version: 1.0\nContent-Type: text/markdown; charset=utf-8\n\n# Hello\n\n**Bold** text.';
		const body = resolveMailBody({ text: raw });

		expect(body.bodyType).toBe(MAIL_BODY.MARKDOWN);
		expect(body.text).toBe('# Hello\n\n**Bold** text.');
		expect(body.text).not.toContain('MIME-Version');
	});

	it('unwraps a nested raw html body without rendering the headers', () => {
		const raw = 'MIME-Version: 1.0\nContent-Type: text/html; charset=utf-8\n\n<div>Hi</div><p>There</p>';
		const body = resolveMailBody({ text: raw });

		expect(body.bodyType).toBe(MAIL_BODY.HTML);
		expect(body.html).toContain('<div>Hi</div>');
		expect(body.html).not.toContain('MIME-Version');
	});

	it('unwraps a raw message whose header separator holds spaces', () => {
		const raw = 'Content-Type: text/markdown; charset=utf-8\n \n# Hello';
		const body = resolveMailBody({ text: raw });

		expect(body.bodyType).toBe(MAIL_BODY.MARKDOWN);
		expect(body.text).toBe('# Hello');
	});

	it('unwraps a nested raw plain body and drops the header block', () => {
		const raw = 'From: a@b.c\nTo: c@d.e\nSubject: hi\n\nHello there';
		const body = resolveMailBody({ text: raw });

		expect(body.bodyType).toBe(MAIL_BODY.PLAIN);
		expect(body.text).toBe('Hello there');
	});

	it('leaves prose that merely starts with a word and a colon alone', () => {
		const prose = 'Note: this is important.\n\nThanks';
		const body = resolveMailBody({ text: prose });

		expect(body.bodyType).toBe(MAIL_BODY.PLAIN);
		expect(body.text).toBe(prose);
	});

	it('prefers a real HTML part over markup in the text part', () => {
		const body = resolveMailBody({ html: '<p>real</p>', text: DOC });

		expect(body.html).toBe('<p>real</p>');
	});

	it('exposes the detector for callers that classify stored rows', () => {
		expect(looksLikeHtmlDocument(DOC)).toBe(true);
		expect(looksLikeHtmlDocument('plain sentence')).toBe(false);
		expect(looksLikeHtmlDocument('')).toBe(false);
	});

	it('reports the effective html to the blacklist / code extractor', () => {
		const body = resolveMailBody({ text: DOC });
		const view = bodyViewFor({ subject: 's', text: DOC }, body);

		expect(view.html).toBe(DOC);
		expect(view.text).toBe(DOC);
	});
});
