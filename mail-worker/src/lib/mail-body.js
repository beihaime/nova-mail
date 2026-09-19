/**
 * Which body Nova Mail stores and how the reader must render it.
 *
 * The mail client has to know the difference because the three shapes need
 * different renderers: HTML goes through the sandboxed iframe, markdown through
 * markdown-it, and plain text through the escaping parser.
 */

export const MAIL_BODY = {
	HTML: 'text/html',
	MARKDOWN: 'text/markdown',
	PLAIN: 'text/plain',
};

const decoder = new TextDecoder();

/** postal-mime hands text parts back as bytes; markdown lands there too. */
export function decodePartContent(content) {
	if (content == null) return '';
	if (typeof content === 'string') return content;
	if (content instanceof ArrayBuffer) return decoder.decode(content);
	if (ArrayBuffer.isView(content)) return decoder.decode(content);
	return String(content);
}

/** Normalised MIME type of a parsed part, without parameters. */
export function partMimeType(part) {
	return String(part?.mimeType || '').split(';')[0].trim().toLowerCase();
}

export function isMarkdownPart(part) {
	return partMimeType(part) === MAIL_BODY.MARKDOWN;
}

/**
 * Does this text body actually hold an HTML document?
 *
 * Plenty of senders leave out `Content-Type` entirely, or label an HTML body
 * `text/plain`. MIME parsing cannot invent the missing part, so the markup ends up
 * in `text` — and storing that as plain text makes the reader escape it, which is
 * how a message body shows up as visible `<html><body>…` source.
 *
 * A bare tag count is not enough: a short but perfectly real HTML mail such as
 * `<p>Hello</p>`, `<div>Only one div</div>` or `Line one<br>Line two` carries only
 * one or two tags, so it used to fall through as plain text. The check now also
 * accepts a body that *opens* with a tag and a body containing any structural or
 * void tag (`<br>`, `<img>`, `<table>` …). Prose that merely mentions an inline
 * tag still needs several tags before it is treated as markup.
 *
 * @param {string} text
 * @returns {boolean}
 */
const TAG_RE = /<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi;
const OPENING_TAG_RE = /^\s*<\/?[a-z][a-z0-9-]*(?:\s[^>]*)?\/?>/i;
// Tags that essentially never show up in prose: void/structural markup.
const STRUCTURAL_TAGS = new Set([
	'br', 'hr', 'img', 'picture', 'source', 'video', 'audio',
	'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
	'ul', 'ol', 'li', 'dl', 'dt', 'dd',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'blockquote', 'pre', 'center', 'font', 'head', 'body', 'html', 'meta', 'link', 'style', 'script',
]);

export function looksLikeHtmlDocument(text) {
	const value = String(text || '').trim();
	if (!value) return false;

	if (/^<!doctype\s+html/i.test(value)) return true;

	const tags = [...value.matchAll(TAG_RE)];
	if (!tags.length) return false;

	// A body that opens with a tag is markup, not prose.
	if (OPENING_TAG_RE.test(value)) return true;

	// One structural tag is enough: <br>, <img>, <table> … are not prose.
	if (tags.some(match => STRUCTURAL_TAGS.has(match[1].toLowerCase()))) return true;

	// Otherwise several inline tags are needed, so prose merely mentioning one
	// ("See <a href=\"x\">this</a> link.") is still treated as prose.
	return tags.length >= 3;
}

/**
 * Pick the body of a parsed mail.
 *
 * `multipart/alternative` carries both `text/plain` and `text/html`; postal-mime
 * fills `html` and `text`, and HTML wins (it preserves the sender's layout,
 * which is what the reader is for).
 *
 * `text/markdown` is not a body type postal-mime knows, so such a part arrives
 * inside `attachments`. It is taken from there and returned as `markdownPart` so
 * the caller can drop it from the attachment list — the mail's own body must
 * never be offered as a file, and without this the message would render empty
 * with a mysterious "body.md" attachment.
 *
 * @param {{html?:string, text?:string, attachments?:object[]}} parsed postal-mime result
 * @returns {{bodyType: string, html: string, text: string, markdown: string, markdownPart: object|null}}
 */
export function resolveMailBody(parsed) {
	const html = String(parsed?.html || '');

	if (html.trim()) {
		return {
			bodyType: MAIL_BODY.HTML,
			html,
			text: String(parsed?.text || ''),
			markdown: '',
			markdownPart: null,
		};
	}

	const parts = Array.isArray(parsed?.attachments) ? parsed.attachments : [];
	const markdownPart = parts.find(isMarkdownPart) || null;

	if (markdownPart) {
		const markdown = decodePartContent(markdownPart.content);
		if (markdown.trim()) {
			return { bodyType: MAIL_BODY.MARKDOWN, html: '', text: markdown, markdown, markdownPart };
		}
	}

	const text = String(parsed?.text || '');

	if (text.trim()) {
		// No HTML part, but the text is a markup document: that is the body, and it
		// has to reach the reader as HTML or it will be shown as source.
		if (looksLikeHtmlDocument(text)) {
			return { bodyType: MAIL_BODY.HTML, html: text, text, markdown: '', markdownPart: null };
		}

		return { bodyType: MAIL_BODY.PLAIN, html: '', text, markdown: '', markdownPart: null };
	}

	// A body-less mail (headers only, or malformed) is stored as-is; the reader
	// shows its "body could not be loaded" affordance.
	return { bodyType: '', html: '', text, markdown: '', markdownPart: null };
}

/**
 * The body as other features see it (blacklist matching, code extraction), so a
 * markdown body is not silently ignored by them.
 */
export function bodyViewFor(parsed, body) {
	return {
		...parsed,
		html: body?.bodyType === MAIL_BODY.HTML ? body.html || '' : '',
		text: body?.text || '',
	};
}

export default { MAIL_BODY, resolveMailBody, bodyViewFor, isMarkdownPart, partMimeType, decodePartContent, looksLikeHtmlDocument };
