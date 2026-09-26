/**
 * Is this text body really an HTML document?
 *
 * A mirror of `looksLikeHtmlDocument()` in the Worker's `src/lib/mail-body.js`,
 * kept dependency-free so both the list (previews) and the reader can use it
 * without pulling the sanitizer into their bundles.
 *
 * It matters because plenty of senders omit `Content-Type` or label an HTML body
 * `text/plain`. MIME parsing cannot invent the missing part, so the markup is
 * stored in `text`, and rendering that through the escaping plain-text path is
 * how a message body ends up displayed as visible `<html><body>…` source.
 *
 * Conservative on purpose: a whole document is always markup; otherwise at least
 * three real tags are required, so prose that merely mentions `<b>` stays prose.
 */

const DOCUMENT_START = /^\s*(?:<!doctype\s+html|<html[\s>])/i

const TAG = /<\/?(?:html|head|body|div|p|span|table|tbody|thead|tr|td|th|h[1-6]|ul|ol|li|br|img|a|strong|em|b|i|u|blockquote|font)\b[^>]*>/gi

/** Minimum number of tags a fragment needs before it counts as markup. */
export const HTML_TAG_THRESHOLD = 3

export function looksLikeHtmlDocument(text) {
  const value = String(text || '')
  if (!value.trim()) return false
  if (DOCUMENT_START.test(value)) return true

  const tags = value.match(TAG)
  return Boolean(tags && tags.length >= HTML_TAG_THRESHOLD)
}

export default { looksLikeHtmlDocument, HTML_TAG_THRESHOLD }
