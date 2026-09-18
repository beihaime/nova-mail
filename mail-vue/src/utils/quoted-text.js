/**
 * Quote parsing + collapsed-preview extraction.
 *
 * Nova Mail receives two body shapes:
 *
 *  1. plain text (`email.text`) — quotes are only implied:
 *       > a line quoted once
 *       >> quoted twice
 *       On Sat, Alice wrote:
 *       the original message…
 *
 *  2. HTML (`email.content`) — quotes are real nodes: `<blockquote>`,
 *     Gmail's `.gmail_quote`, Yahoo's `.yahoo_quoted`, Outlook's
 *     `#divRplyFwdMsg`, …
 *
 * This module owns both sides of the reader contract:
 *
 *  - `buildMessagePreview()` → what a **collapsed** card may show: the first
 *    paragraph of the *new* text only. Quoted history, "On … wrote:" headers,
 *    forwarded blocks and raw markup never leak into the summary.
 *
 *  - `quotedTextToHtml()` / `wrapHtmlQuotes()` → what an **expanded** card
 *    renders: the body with the quoted history moved behind a native
 *    `<details>` toggle (collapsed by default, Gmail style). Nested quote
 *    levels keep their own `.quote-block` / `blockquote` left rule.
 */

const MAX_DEPTH = 5
export const MAX_PREVIEW = 180

// "> quoted", ">> deeper"
const MARKED_LINE = /^\s*((?:>\s*)+)(.*)$/

// "On <date>, <name> wrote:" / Chinese equivalent / Outlook & forwarded headers.
const QUOTE_HEADER = /^(?:\s*On\b.{0,200}\bwrote:|\s*在.{0,80}(?:写道|寫道)\s*[:：]|\s*-{2,}\s*(?:Original Message|Forwarded message|原始邮件|转发邮件|轉寄邮件)\s*-{2,}|\s*_{5,}\s*|\s*From:\s.+\S)/i

// "-----Original Message-----", "------------------", "________"
const FORWARD_MARKER = /^\s*(?:-{2,}\s*(?:Original Message|Forwarded message|原始邮件|转发邮件|轉寄邮件)\s*-{2,}|_{5,}|-{5,}\s*$)/i

// Header block of a forwarded message ("From: …", "发件人：…", "Sent: …").
const HEADER_FIELD = /^\s*(?:From|Sent|To|Cc|Bcc|发件人|收件人|抄送|密送|发送时间)\s*[:：]\s/i

// Elements that Gmail / Yahoo / Outlook / Proton wrap quoted history in.
const HTML_QUOTE_SELECTOR = [
    'blockquote',
    '.gmail_quote',
    '.gmail_quote_container',
    '[class*="gmail_quote"]',
    '.yahoo_quoted',
    '[id^="yahoo_quoted"]',
    '[id^="divRplyFwdMsg"]',
    '[id^="appendonsend"]',
    '.moz-cite-prefix',
    '[class*="protonmail_quote"]',
].join(',')

const BLOCK_TAGS = new Set([
    'address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset',
    'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5',
    'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section',
    'table', 'td', 'th', 'tr', 'ul',
])

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/** A line that starts the quoted history of a plain-text body. */
function isQuoteStart(line) {
    return MARKED_LINE.test(line)
        || QUOTE_HEADER.test(line)
        || FORWARD_MARKER.test(line)
        || HEADER_FIELD.test(line)
}

export function isQuotedPlainText(text) {
    const value = String(text || '')
    if (!value) return false
    return value.split(/\r\n?|\n/).some(line => isQuoteStart(line))
}

/**
 * Everything *before* the quoted history of a plain-text body.
 *
 * Stops at the first line that starts a quote — whether it is a ">" marker, an
 * "On … wrote:" attribution, a forwarded-message separator or a forwarded
 * header block. Nothing after that point can reach a collapsed preview.
 */
export function stripQuotedPlainText(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
    const kept = []

    for (const line of lines) {
        if (isQuoteStart(line)) break
        kept.push(line)
    }

    return kept.join('\n').replace(/[ \t]+$/gm, '').trim()
}

/** First non-empty paragraph, whitespace collapsed onto one line. */
export function firstParagraph(text) {
    const value = String(text || '').replace(/\r\n?/g, '\n').trim()
    if (!value) return ''

    const paragraphs = value.split(/\n\s*\n/)
    const first = paragraphs.find(item => item.trim())

    return (first || value).replace(/\s+/g, ' ').trim()
}

function truncate(value, max) {
    const text = String(value || '').trim()
    if (text.length <= max) return text
    return `${text.slice(0, max).trimEnd()}…`
}

/** Collapsed-card summary for a plain-text body. */
export function plainTextPreview(text, max = MAX_PREVIEW) {
    return truncate(firstParagraph(stripQuotedPlainText(text)), max)
}

/** Recursively flatten a DOM subtree, keeping block boundaries as newlines. */
function extractNodeText(node) {
    let out = ''

    node.childNodes?.forEach(child => {
        if (child.nodeType === 3) {
            out += child.nodeValue || ''
            return
        }
        if (child.nodeType !== 1) return

        const tag = String(child.tagName || '').toLowerCase()
        if (tag === 'br') {
            out += '\n'
            return
        }
        if (tag === 'script' || tag === 'style') return

        const block = BLOCK_TAGS.has(tag)
        if (block) out += '\n'
        out += extractNodeText(child)
        if (block) out += '\n'
    })

    return out
}

/**
 * Parse an email body into a document.
 *
 * Fragments are given an explicit `<html><body>` shell (instead of relying on
 * the parser to synthesise one) so the wrapper element survives in every
 * environment, not just browsers.
 */
function parseHtmlDocument(source) {
    if (typeof DOMParser === 'undefined') return null

    const input = /<html[\s>]/i.test(source)
        ? source
        : `<!doctype html><html><head></head><body><div data-nova-root="1">${source}</div></body></html>`

    try {
        return new DOMParser().parseFromString(input, 'text/html')
    } catch {
        return null
    }
}

/**
 * HTML → plain text. Quoted-history containers are dropped before any text is
 * collected, so a collapsed summary can never contain the raw quote block.
 */
export function htmlToPlainText(html, { dropQuotes = true } = {}) {
    const source = String(html || '')
    if (!source) return ''

    const doc = parseHtmlDocument(source)
    if (!doc) return source.replace(/<[^>]*>/g, ' ')

    if (dropQuotes && doc.body) {
        doc.body.querySelectorAll(HTML_QUOTE_SELECTOR).forEach(node => node.remove())
    }

    return extractNodeText(doc.body || doc.documentElement || doc)
}

/** Collapsed-card summary for an HTML body. */
export function htmlPreview(html, max = MAX_PREVIEW) {
    return truncate(firstParagraph(stripQuotedPlainText(htmlToPlainText(html))), max)
}

// Preview is derived from a row that lives in the store. A WeakMap keeps the
// (HTML-parsing) work to once per row without retaining detached strings.
const previewCache = new WeakMap()

/**
 * Collapsed-card summary for any email row.
 *
 * Preference order mirrors what the reader actually renders: full plain text,
 * the list's trimmed `listText`, then the HTML body. Whichever source is used,
 * the quoted history is removed first.
 */
export function buildMessagePreview(raw, max = MAX_PREVIEW) {
    if (!raw || typeof raw !== 'object') return ''

    const cached = previewCache.get(raw)
    if (cached !== undefined) return cached

    const text = String(raw.text || '').trim()
    const listText = String(raw.listText || '').trim()
    const html = String(raw.content || '').trim()

    let preview = ''
    if (text) preview = plainTextPreview(text, max)
    else if (listText) preview = truncate(firstParagraph(stripQuotedPlainText(listText)), max)
    else if (html) preview = htmlPreview(html, max)

    previewCache.set(raw, preview)
    return preview
}

/** Split a plain-text body into `{ head, quote }` line arrays. */
function splitPlainTextQuote(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')

    for (let i = 0; i < lines.length; i++) {
        if (isQuoteStart(lines[i])) return { head: lines.slice(0, i), quote: lines.slice(i) }
    }

    return { head: lines, quote: [] }
}

/**
 * Render the quoted slice of a plain-text body as nested `.quote-block`s.
 * Every '>' adds a level, so multi-level quotes get stacked left rules.
 */
function renderQuoteMarkup(lines) {
    let html = ''
    let depth = 0
    let level = 1
    let inQuote = false

    const closeQuotes = () => {
        while (depth > 0) {
            html += '</div>'
            depth--
        }
    }

    const openTo = (next) => {
        while (depth < next) {
            html += '<div class="quote-block">'
            depth++
        }
        while (depth > next) {
            html += '</div>'
            depth--
        }
    }

    for (const line of lines) {
        const marked = line.match(MARKED_LINE)

        if (marked) {
            const markedLevel = Math.min((marked[1].match(/>/g) || []).length, MAX_DEPTH)
            openTo(markedLevel)
            level = markedLevel
            html += `<div class="quote-line">${escapeHtml(marked[2])}</div>`
            inQuote = true
            continue
        }

        // "On … wrote:" sits above its quote, so it stays at the current level
        // and everything after it moves one level deeper.
        if (QUOTE_HEADER.test(line) || FORWARD_MARKER.test(line)) {
            if (!inQuote) {
                closeQuotes()
                level = 1
                inQuote = true
            } else {
                level = Math.min(level + 1, MAX_DEPTH)
            }

            html += `<div class="quote-header">${escapeHtml(line)}</div>`
            openTo(level)
            continue
        }

        openTo(level)
        html += `<div class="quote-line">${escapeHtml(line)}</div>`
    }

    closeQuotes()
    return html
}

/**
 * Plain-text body → HTML.
 *
 * The new text is rendered inline; the quoted history is wrapped in a native
 * `<details class="quote-toggle">` so it is collapsed by default and expands on
 * click. Every piece of text is escaped here, so the result is safe for `v-html`.
 *
 * @param {string} text plain-text email body
 * @param {string} label text shown on the collapsed quote toggle
 */
export function quotedTextToHtml(text, label = '…') {
    const source = String(text || '').replace(/\r\n?/g, '\n')
    const { head, quote } = splitPlainTextQuote(source)

    let html = ''
    const headText = head.join('\n').replace(/\s+$/, '')

    if (headText.trim()) {
        html += `<div class="quote-plain">${escapeHtml(headText)}</div>`
    }

    if (quote.length && quote.some(line => line.trim())) {
        html += `<details class="quote-toggle"><summary class="quote-toggle-summary">${escapeHtml(label)}</summary><div class="quote-content">${renderQuoteMarkup(quote)}</div></details>`
    }

    // A body that is *only* a quote still needs to render the toggle.
    return html || `<div class="quote-plain">${escapeHtml(source)}</div>`
}

/**
 * Wrap the quoted history of an **HTML** body in a collapsed `<details>`.
 *
 * The root is split at the top-level node that contains the first quote
 * container: everything before it is the new message, everything from it on is
 * quoted history. Bodies without a detectable quote container are returned
 * untouched. Nested `blockquote` levels keep their own left rule (see the
 * ShadowHtml stylesheet).
 *
 * @param {string} html sanitized-or-raw email HTML
 * @param {string} label text shown on the collapsed quote toggle
 */
export function wrapHtmlQuotes(html, label = '…') {
    const source = String(html || '')
    if (!source || typeof DOMParser === 'undefined') return source

    const doc = parseHtmlDocument(source)
    if (!doc?.body) return source

    // Fragments carry the `data-nova-root` shell; a whole document uses <body>.
    const root = doc.body.querySelector('[data-nova-root]') || doc.body

    const quote = root.querySelector(HTML_QUOTE_SELECTOR)
    if (!quote) return source

    // Climb to the direct child of the root that holds the quote.
    let top = quote
    while (top.parentElement && top.parentElement !== root) top = top.parentElement
    if (top.parentElement !== root) return source

    const head = doc.createElement('div')
    const quoted = doc.createElement('div')
    let reachedQuote = false

    for (const child of Array.from(root.childNodes)) {
        if (child === top) reachedQuote = true
        ;(reachedQuote ? quoted : head).appendChild(child)
    }

    const quoteHtml = quoted.innerHTML
    if (!quoteHtml.trim()) return source

    return `${head.innerHTML}<details class="quote-toggle" data-nova-quote="1"><summary class="quote-toggle-summary">${escapeHtml(label)}</summary><div class="quote-content">${quoteHtml}</div></details>`
}
