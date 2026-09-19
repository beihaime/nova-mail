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

	it('does not treat prose that mentions a tag as markup', () => {
		expect(emailUtils.toPreviewText('Use a <div> for blocks', null))
			.toBe('Use a <div> for blocks');
	});

	it('stays compact (single line, no source) for a long html body', () => {
		const long = '<!DOCTYPE html><html><body>' + '<div>Sentence number one.</div>'.repeat(40) + '</body></html>';
		const preview = emailUtils.toPreviewText(long, null);

		expect(preview).not.toMatch(/[<>]/);
		expect(preview).not.toContain('\n');
	});
});
