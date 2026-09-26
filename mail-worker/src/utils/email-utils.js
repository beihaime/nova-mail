import { parseHTML } from 'linkedom';
import { MAIL_BODY, looksLikeHtmlDocument, unwrapNestedMessage } from '../lib/mail-body.js';

/**
 * Markdown syntax that must not survive into a one-line row preview.
 *
 * The reader renders the real markdown (markdown-it, see the client's
 * `mail-html.js`); a list row only needs its words, so headings, list bullets,
 * code fences, link/image wrappers and emphasis markers are flattened here.
 */
const MARKDOWN_NOISE = [
	[/^[ \t]*(?:```|~~~)[^\n]*$/gm, ''],        // fenced code markers
	[/^#{1,6}[ \t]+/gm, ''],                    // headings
	[/^[ \t]*>[ \t]?/gm, ''],                   // block quotes
	[/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, ''],     // list markers
	[/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*$/gm, ''], // table rules
	[/`{1,3}([^`]*)`{1,3}/g, '$1'],             // inline code
	[/!\[([^\]]*)\]\([^)]*\)/g, '$1'],          // images
	[/\[([^\]]*)\]\([^)]*\)/g, '$1'],           // links
	[/\*\*([^*]+)\*\*/g, '$1'],                 // bold
	[/__([^_]+)__/g, '$1'],
	[/\*([^*\n]+)\*/g, '$1'],                   // italic
	[/~~([^~]+)~~/g, '$1'],                     // strikethrough
	[/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, ''],      // horizontal rule
	[/\|/g, ' '],                               // table cell separators
]

function stripMarkdown(value) {
	let text = String(value || '');
	for (const [pattern, replacement] of MARKDOWN_NOISE) text = text.replace(pattern, replacement);
	return text;
}

/**
 * Plain text of a parsed DOM node.
 *
 * Walks text nodes and treats element boundaries as word separators, so
 * `<div>Hello</div><div>World</div>` becomes "Hello World" rather than
 * "HelloWorld". Comments and other non-content nodes are skipped. This is the
 * DOM equivalent of `textContent`, with the block spacing `innerText` would add.
 */
function nodeText(node) {
	let out = '';
	for (const child of node.childNodes || []) {
		if (child.nodeType === 3) {
			out += child.nodeValue || '';
		} else if (child.nodeType === 1) {
			out += ` ${nodeText(child)} `;
		}
	}
	return out;
}

const emailUtils = {

	getDomain(email) {
		if (typeof email !== 'string') return '';
		const parts = email.split('@');
		return parts.length === 2 ? parts[1] : '';
	},

	getName(email) {
		if (typeof email !== 'string') return '';
		const parts = email.trim().split('@');
		return parts.length === 2 ? parts[0] : '';
	},

	getBaseEmail(email) {
		const parts = email.split('@');
		if (parts.length !== 2) return '';
		const localPart = parts[0].split('+')[0];
		return localPart + '@' + parts[1];
	},

	formatText(text) {
		if (!text) return ''
		return text
			.split('\n')
			.map(line => {
				return line.replace(/[\u200B-\u200F\uFEFF\u034F\u200B-\u200F\u00A0\u3000\u00AD]/g, '')
					.replace(/\s+/g, ' ')
					.trim();
			})
			.join('\n')
			.replace(/\n{3,}/g, '\n')
			.trim();
	},

	/**
	 * One-line preview text for an Inbox row.
	 *
	 * The reader renders the real body (HTML in a sandboxed frame, markdown via
	 * markdown-it); a row only needs words, so:
	 * - a markdown body is flattened from its syntax first;
	 * - an HTML body (or a markup document that arrived in `text`) goes through
	 *   `htmlToText`, so `<!DOCTYPE html>` / `<div>` can never appear;
	 * - otherwise the plain-text part is used as-is.
	 * Whitespace is normalised here and the caller truncates to the column length.
	 *
	 * @param {string} text  the message's text part
	 * @param {string} [html] the message's html part
	 * @param {string} [bodyType] one of MAIL_BODY (text/markdown, text/html, …)
	 */
	toPreviewText(text, html, bodyType) {
		// A stored body may itself be a whole raw message (forwarded source, bounce,
		// digest, or a "paste the raw mail" test): unwrap it first so its
		// `MIME-Version:` / `Content-Type:` lines never reach the row.
		const nested = unwrapNestedMessage(text);
		if (nested) return this.toPreviewText(nested.text, nested.html, nested.bodyType);

		let source;

		if (bodyType === MAIL_BODY.MARKDOWN) {
			source = this.formatText(stripMarkdown(text));
		} else {
			const plain = this.formatText(text);
			source = plain && !looksLikeHtmlDocument(plain)
				? plain
				: this.htmlToText(html || text);
		}

		source = source.replace(/\s+/g, ' ').trim();

		// Last guard: a row preview is plain text, so tag-like fragments must never
		// reach the list even when the stored body was classified as plain (short
		// HTML bodies, prose that quotes a tag). The parser strips them safely.
		if (/<[a-z!/][^>]*>/i.test(source)) {
			source = this.htmlToText(source).replace(/\s+/g, ' ').trim();
		}
		return source;
	},

	/**
	 * Convert an HTML body to plain text through a real parser.
	 *
	 * Never regex-strips markup: linkedom parses the document, non-content nodes
	 * (style/script/title/noscript/head) are removed, and the remaining DOM is
	 * flattened to text with whitespace normalised. Used for list previews and
	 * notification snippets, where showing raw source would be a bug.
	 */
	htmlToText(content) {
		if (!content) return ''
		try {
			const wrappedContent = content.includes('<body')
				? content
				: `<!DOCTYPE html><html><body>${content}</body></html>`;
			const { document } = parseHTML(wrappedContent);
			document.querySelectorAll('style, script, title, noscript, head').forEach(el => el.remove());
			// Collapse the flattened DOM (and any source newlines between tags) to a
			// single normalised line before formatText strips the invisible characters.
			return this.formatText(nodeText(document.body).replace(/\s+/g, ' '));
		} catch (e) {
			console.error(e)
			return ''
		}
	}
};

export default emailUtils;
