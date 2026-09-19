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
 * @returns {{bodyType: string, text: string, markdown: string, markdownPart: object|null}}
 */
export function resolveMailBody(parsed) {
	const html = String(parsed?.html || '').trim();

	if (html) {
		return {
			bodyType: MAIL_BODY.HTML,
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
			return { bodyType: MAIL_BODY.MARKDOWN, text: markdown, markdown, markdownPart };
		}
	}

	const text = String(parsed?.text || '');

	if (text.trim()) {
		return { bodyType: MAIL_BODY.PLAIN, text, markdown: '', markdownPart: null };
	}

	// A body-less mail (headers only, or malformed) is stored as-is; the reader
	// shows its "body could not be loaded" affordance.
	return { bodyType: '', text, markdown: '', markdownPart: null };
}

/**
 * The body as other features see it (blacklist matching, code extraction), so a
 * markdown body is not silently ignored by them.
 */
export function bodyViewFor(parsed, body) {
	return {
		...parsed,
		html: body?.bodyType === MAIL_BODY.HTML ? parsed?.html || '' : '',
		text: body?.text || '',
	};
}

export default { MAIL_BODY, resolveMailBody, bodyViewFor, isMarkdownPart, partMimeType, decodePartContent };
