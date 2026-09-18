/**
 * Plain-text quote parsing.
 *
 * Plain-text replies carry no markup, so the quoted history is only implied:
 *
 *   > a line quoted once
 *   >> quoted twice
 *   On Sat, Alice wrote:
 *   the original message…
 *
 * `quotedTextToHtml` turns that into nested `.quote-block` elements, so the
 * reader can draw the same Gmail-style hierarchy line it draws for HTML
 * `blockquote`s. Every piece of text is HTML-escaped here, so the result is safe
 * to render with `v-html`.
 */

const MAX_DEPTH = 5

// "On <date>, <name> wrote:" / Chinese equivalent / Outlook & forwarded headers.
const QUOTE_HEADER = /^(?:\s*On\b.{0,200}\bwrote:|\s*在.{0,80}(?:写道|寫道)\s*[:：]|\s*-{2,}\s*(?:Original Message|Forwarded message)\s*-{2,}|\s*_{5,}\s*|\s*From:\s.+\S)/i

const MARKED_LINE = /^\s*((?:>\s*)+)(.*)$/

export function isQuotedPlainText(text) {
    const value = String(text || '')
    if (!value) return false
    return MARKED_LINE.test(value) || QUOTE_HEADER.test(value)
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/**
 * @param {string} text plain-text email body
 * @returns {string} HTML with `.quote-plain` / `.quote-header` / `.quote-block`
 *                   / `.quote-line` elements, oldest quote levels nested.
 */
export function quotedTextToHtml(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')

    let html = ''
    let depth = 0
    let level = 1
    let inQuote = false
    let plain = []

    const flushPlain = () => {
        if (!plain.length) return
        html += `<div class="quote-plain">${escapeHtml(plain.join('\n'))}</div>`
        plain = []
    }

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

        // "> …" — the number of '>' is the explicit nesting level.
        if (marked) {
            flushPlain()
            const markedLevel = Math.min((marked[1].match(/>/g) || []).length, MAX_DEPTH)
            openTo(markedLevel)
            level = markedLevel
            html += `<div class="quote-line">${escapeHtml(marked[2])}</div>`
            inQuote = true
            continue
        }

        // "On … wrote:" — sits above its quote, so it stays on the current level
        // and everything after it moves one level deeper.
        if (QUOTE_HEADER.test(line)) {
            flushPlain()

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

        if (inQuote) {
            openTo(level)
            html += `<div class="quote-line">${escapeHtml(line)}</div>`
        } else {
            plain.push(line)
        }
    }

    flushPlain()
    closeQuotes()

    return html
}
