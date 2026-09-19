import { parseHTML } from 'linkedom';
import { looksLikeHtmlDocument } from '../lib/mail-body.js';

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
	 * Prefers the stored plain-text part, but only when it really is plain text:
	 * senders that omit or mislabel Content-Type leave a whole HTML document in
	 * `text`, and using it verbatim is what put `<!DOCTYPE html>` into previews.
	 * Markup goes through `htmlToText` instead; whitespace is normalised here and
	 * the caller truncates to the column length.
	 *
	 * @param {string} text  the message's text part
	 * @param {string} [html] the message's html part
	 */
	toPreviewText(text, html) {
		const plain = this.formatText(text);
		const source = plain && !looksLikeHtmlDocument(plain)
			? plain
			: this.htmlToText(html || text);
		return source.replace(/\s+/g, ' ').trim();
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
