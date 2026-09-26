import { describe, it, expect } from 'vitest';
import emailUtils from '../src/utils/email-utils.js';

describe('emailUtils.htmlToText', () => {
	it('drops a full HTML document down to its text', () => {
		const html = '<!DOCTYPE html><html><head><title>Subject</title><style>.a{color:red}</style></head>'
			+ '<body><div>Hello <b>World</b></div><script>evil()</script><p>Second line</p></body></html>';

		const text = emailUtils.htmlToText(html);

		expect(text).toBe('Hello World Second line');
		expect(text).not.toMatch(/<!DOCTYPE|<html|<div|<script|evil\(\)|color:red/i);
	});

	it('keeps word boundaries between block elements', () => {
		expect(emailUtils.htmlToText('<div>Hello</div><div>World</div>')).toBe('Hello World');
	});

	it('decodes entities and normalises whitespace', () => {
		const text = emailUtils.htmlToText('<p>Tom &amp; Jerry</p>\n\n<p>   spaced   out   </p>');

		expect(text).toBe('Tom & Jerry spaced out');
	});

	it('never surfaces style or script text for a fragment', () => {
		const text = emailUtils.htmlToText('<style>p{}</style><div>Kept</div><script>bad()</script>');

		expect(text).toBe('Kept');
	});

	it('returns an empty string for empty input', () => {
		expect(emailUtils.htmlToText('')).toBe('');
		expect(emailUtils.htmlToText(null)).toBe('');
	});
});

describe('emailUtils.toPreviewText', () => {
	it('converts markup that arrived in the text part (missing Content-Type)', () => {
		const preview = emailUtils.toPreviewText(
			'<!DOCTYPE html><html><body><div>Hi there</div><div>Your order shipped</div></body></html>',
			null,
		);

		expect(preview).toBe('Hi there Your order shipped');
		expect(preview).not.toMatch(/<!DOCTYPE|<html|<div/i);
	});

	it('keeps a real plain-text part as-is', () => {
		expect(emailUtils.toPreviewText('Plain body line one\nline two', null))
			.toBe('Plain body line one line two');
	});

	it('falls back to the html part when there is no text part', () => {
		expect(emailUtils.toPreviewText('', '<div>From the html part</div>'))
			.toBe('From the html part');
	});

	it('never lets a tag reach the preview, even from a plain-classified body', () => {
		// The stored body may be plain, but a row preview must still be text only.
		expect(emailUtils.toPreviewText('Use a <div> for blocks', null))
			.toBe('Use a for blocks');
		expect(emailUtils.toPreviewText('Hello <div>World</div>', null))
			.toBe('Hello World');
	});

	it('stays compact (single line, no source) for a long html body', () => {
		const long = '<!DOCTYPE html><html><body>' + '<div>Sentence number one.</div>'.repeat(40) + '</body></html>';
		const preview = emailUtils.toPreviewText(long, null);

		expect(preview).not.toMatch(/[<>]/);
		expect(preview).not.toContain('\n');
	});
});

describe('emailUtils.toPreviewText (markdown)', () => {
	const MD = 'text/markdown';

	it('renders markdown syntax down to its words for the list preview', () => {
		const preview = emailUtils.toPreviewText('# Release notes\n\n**Shipping** [today](https://x.y).', null, MD);

		expect(preview).toBe('Release notes Shipping today.');
	});

	it('drops list markers, quotes, code fences and table pipes', () => {
		const preview = emailUtils.toPreviewText(
			'> Intro\n\n- first\n- second\n\n```js\nconst a = 1\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |',
			null,
			MD,
		);

		expect(preview).not.toMatch(/[#>`*|]/);
		expect(preview).toContain('first second');
	});

	it('unwraps images to their alt text and strips emphasis', () => {
		expect(emailUtils.toPreviewText('![Logo](https://x/y.png) ~~old~~ *new*', null, MD))
			.toBe('Logo old new');
	});

	it('ignores markdown flattening for non-markdown bodies', () => {
		// A plain-text body keeps its asterisks: only markdown bodies are flattened.
		expect(emailUtils.toPreviewText('2 * 3 = 6', null, 'text/plain')).toBe('2 * 3 = 6');
	});
});

describe('emailUtils.toPreviewText (raw message body)', () => {
	it('unwraps a pasted raw message instead of showing its MIME headers', () => {
		const raw = 'MIME-Version: 1.0\n'
			+ 'Content-Type: text/markdown; charset=utf-8\n\n'
			+ '# Hello\n\n**Bold** text with a [link](https://example.com).';

		const preview = emailUtils.toPreviewText(raw, null, 'text/plain');

		expect(preview).toBe('Hello Bold text with a link.');
		expect(preview).not.toContain('MIME-Version');
	});
});
