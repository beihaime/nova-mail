import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

/**
 * Everything that turns an untrusted mail body into something safe to render.
 *
 * Mail bodies, subjects, display names and attachment filenames are all
 * attacker-controlled, so this module is the single place that decides what may
 * reach the DOM. It is deliberately dependency-light and DOM-only (no Vue), so
 * the security rules can be unit tested directly.
 *
 * Defence in depth, in order:
 *   1. markdown-it with `html: false` never emits raw HTML from markdown;
 *   2. DOMPurify removes dangerous tags/attributes and unsafe URL schemes;
 *   3. inline CSS is reduced to a display-only allowlist;
 *   4. remote resources are stripped until the reader opts in;
 *   5. links are marked up so the real target is visible and cannot run code.
 */

/* ------------------------------------------------------------- sanitizing */

// Tags that can execute, frame, submit or restyle. `svg`/`math` go too: they
// carry their own scripting and foreign-content parsing rules.
const FORBIDDEN_TAGS = [
  'script', 'noscript', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'applet', 'param', 'form', 'input', 'button', 'select', 'option', 'textarea',
  'style', 'link', 'base', 'meta', 'title', 'svg', 'math', 'template',
  'audio', 'video', 'source', 'track', 'canvas', 'dialog', 'slot', 'portal',
]

const FORBIDDEN_ATTRS = [
  'srcset', 'formaction', 'action', 'ping', 'background', 'dynsrc', 'lowsrc',
  'xlink:href', 'autofocus', 'contenteditable',
]

// Presentation-only properties. Notably absent: position, top/left/right/bottom,
// z-index, transform, filter, opacity, pointer-events, cursor, and anything that
// can pull a remote resource (url(), behaviour, expression, @import).
const ALLOWED_STYLE_PROPERTIES = new Set([
  'background', 'background-color', 'border', 'border-bottom', 'border-collapse',
  'border-color', 'border-left', 'border-radius', 'border-right', 'border-spacing',
  'border-style', 'border-top', 'border-width', 'box-sizing', 'color', 'display',
  'font', 'font-family', 'font-size', 'font-style', 'font-weight', 'height',
  'letter-spacing', 'line-height', 'list-style', 'list-style-type', 'margin',
  'margin-bottom', 'margin-left', 'margin-right', 'margin-top', 'max-height',
  'max-width', 'min-height', 'min-width', 'overflow-wrap', 'padding',
  'padding-bottom', 'padding-left', 'padding-right', 'padding-top', 'text-align',
  'text-decoration', 'text-indent', 'text-transform', 'vertical-align',
  'white-space', 'width', 'word-break', 'word-wrap',
])

const SAFE_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:']

// Our own inline attachments arrive as raster data URLs (see
// private-attachments.js). SVG is excluded on purpose: it can carry script.
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,[a-z0-9+/=]+$/i

const URL_ATTRIBUTES = new Set([
  'href', 'src', 'action', 'formaction', 'poster', 'background', 'xlink:href',
  'ping', 'dynsrc', 'lowsrc', 'cite', 'data', 'srcset',
])

/**
 * True when a URL is safe to keep.
 *
 * Relative targets (including `#anchor`, `/path` and protocol-relative `//host`)
 * are fine; absolute URLs must use an allowlisted scheme. `data:` is allowed only
 * for base64 raster images, which is what our own attachment resolution emits.
 */
export function isSafeUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return false

  // Strip control characters and spaces first: `java\nscript:` and
  // `java\tscript:` are the classic bypasses.
  const normalized = raw.replace(/[\u0000-\u0020\u007f]+/g, '')

  if (normalized.startsWith('#') || normalized.startsWith('/') || normalized.startsWith('?')) return true
  if (normalized.startsWith('//')) return true

  const scheme = normalized.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase()
  if (!scheme) return true

  if (scheme === 'data') return SAFE_DATA_IMAGE.test(normalized)

  return SAFE_SCHEMES.includes(`${scheme}:`)
}

function sanitizeInlineStyle(style) {
  return String(style || '').split(';').map((declaration) => {
    const separator = declaration.indexOf(':')
    if (separator === -1) return ''

    const property = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim()
    const unsafeValue = /(?:expression\s*\(|url\s*\(|@import|javascript:|vbscript:|behavior\s*:|-moz-binding)/i.test(value)

    return ALLOWED_STYLE_PROPERTIES.has(property) && !unsafeValue ? `${property}: ${value}` : ''
  }).filter(Boolean).join('; ')
}

let hooksInstalled = false

function installHooks() {
  if (hooksInstalled) return
  hooksInstalled = true

  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    const name = String(data.attrName || '').toLowerCase()

    // Every on* handler, without maintaining a list.
    if (name.startsWith('on')) {
      data.keepAttr = false
      return
    }

    if (name === 'style') {
      data.attrValue = sanitizeInlineStyle(data.attrValue)
      data.keepAttr = Boolean(data.attrValue)
      return
    }

    if (URL_ATTRIBUTES.has(name) && !isSafeUrl(data.attrValue)) {
      data.keepAttr = false
    }
  })
}

/**
 * Sanitize untrusted mail HTML.
 *
 * @param {string} html
 * @returns {string} markup that only contains presentation-safe HTML
 */
export function sanitizeMailHtml(html) {
  const source = String(html || '')
  if (!source) return ''

  installHooks()

  return DOMPurify.sanitize(source, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: FORBIDDEN_ATTRS,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOW_ARIA_ATTR: false,
    KEEP_CONTENT: true,
    RETURN_DOM_FRAGMENT: false,
  })
}

/* -------------------------------------------------------- external content */

function parseFragment(html) {
  const doc = new DOMParser().parseFromString(`<div data-nova-root="1">${String(html || '')}</div>`, 'text/html')
  return doc.body?.querySelector('[data-nova-root]') || null
}

function isRemoteUrl(value) {
  const raw = String(value || '').trim()
  return /^(?:https?:)?\/\//i.test(raw)
}

/**
 * Defer every remote resource in the body.
 *
 * Remote images are the standard tracking pixel: fetching one leaks the reader's
 * IP, the time the mail was opened and that it was opened at all. The URL is
 * parked on `data-nova-remote-src` (which only this module ever writes) and the
 * tag is marked so the reader can offer to load them.
 *
 * @returns {{html: string, blocked: number}}
 */
export function blockRemoteResources(html) {
  const root = parseFragment(html)
  if (!root) return { html: String(html || ''), blocked: 0 }

  let blocked = 0

  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (isRemoteUrl(src)) {
      img.setAttribute('data-nova-remote-src', src)
      img.removeAttribute('src')
      blocked++
    }

    const source = img.getAttribute('data-nova-remote-source')
    if (isRemoteUrl(source)) {
      img.setAttribute('data-nova-remote-src', source)
      img.removeAttribute('data-nova-remote-source')
      blocked++
    }
  })

  root.querySelectorAll('*').forEach((node) => {
    for (const attribute of ['background', 'data', 'poster']) {
      const value = node.getAttribute(attribute)
      if (!isRemoteUrl(value)) continue
      node.setAttribute(`data-nova-remote-${attribute}`, value)
      node.removeAttribute(attribute)
      blocked++
    }
  })

  return { html: root.innerHTML, blocked }
}

/** Undo `blockRemoteResources` after the reader explicitly allows images. */
export function allowRemoteResources(html) {
  const root = parseFragment(html)
  if (!root) return String(html || '')

  root.querySelectorAll('[data-nova-remote-src]').forEach((node) => {
    node.setAttribute('src', node.getAttribute('data-nova-remote-src'))
    node.removeAttribute('data-nova-remote-src')
  })

  root.querySelectorAll('*').forEach((node) => {
    for (const attribute of ['background', 'data', 'poster']) {
      const parked = node.getAttribute(`data-nova-remote-${attribute}`)
      if (parked === null) continue
      node.setAttribute(attribute, parked)
      node.removeAttribute(`data-nova-remote-${attribute}`)
    }
  })

  return root.innerHTML
}

/**
 * Make links inert-safe and honest.
 *
 * `title` exposes the real destination on hover (so the visible text can never
 * pretend to be a different URL), `rel` blocks the opened page from touching
 * `window.opener`, and any remaining unsafe scheme loses its href.
 */
export function hardenLinks(html) {
  const root = parseFragment(html)
  if (!root) return String(html || '')

  root.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href')

    if (!href || !isSafeUrl(href)) {
      anchor.removeAttribute('href')
      anchor.removeAttribute('target')
      return
    }

    anchor.setAttribute('rel', 'noopener noreferrer nofollow')
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('title', href)

    // A link that claims to be one URL while pointing at another is a phishing
    // signal: keep the real one visible.
    const text = (anchor.textContent || '').trim()
    if (/^(?:https?:)?\/\//i.test(text) && text !== href) {
      anchor.setAttribute('data-nova-mismatch', '1')
    }
  })

  return root.innerHTML
}

/* -------------------------------------------------------------- markdown */

// `html: false` is the important part: raw HTML inside markdown is escaped
// rather than passed through, so markdown can never inject markup.
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})

const defaultLinkValidator = markdown.validateLink.bind(markdown)
markdown.validateLink = (url) => isSafeUrl(url) && defaultLinkValidator(url)

/**
 * Render a markdown body and put it through the same safety pipeline as HTML
 * mail: sanitize (defence in depth) then harden links.
 */
export function renderMarkdown(source) {
  const html = markdown.render(String(source || ''))
  return hardenLinks(sanitizeMailHtml(html))
}

/** Render a small inline markdown fragment (subjects, previews). */
export function renderInlineMarkdown(source) {
  return sanitizeMailHtml(markdown.renderInline(String(source || '')))
}

/**
 * Full pipeline for a `text/markdown` body.
 *
 * Markdown is deliberately *not* rendered through the iframe: markdown-it with
 * `html: false` cannot emit markup of its own, so the sanitized result is plain
 * Vue markup and stays inside the application's own styling (quotes, code,
 * tables). The safety steps are the same ones the HTML path uses.
 *
 * @param {string} source markdown body
 * @param {object} [options]
 * @param {boolean} [options.allowImages] reader opted into remote images
 * @returns {{html: string, blocked: number}}
 */
export function prepareMarkdownBody(source, { allowImages = false } = {}) {
  const html = hardenLinks(sanitizeMailHtml(markdown.render(String(source || ''))))

  if (allowImages) return { html: allowRemoteResources(html), blocked: 0 }

  return blockRemoteResources(html)
}

/* ------------------------------------------------------------ body types */

export const MAIL_BODY_TYPE = {
  HTML: 'text/html',
  MARKDOWN: 'text/markdown',
  PLAIN: 'text/plain',
}

/**
 * Full pipeline for one mail body.
 *
 * @param {object} params
 * @param {string} params.html resolved body markup (HTML, or markdown rendered)
 * @param {boolean} [params.allowImages] reader opted into remote images
 * @returns {{html: string, blocked: number}}
 */
export function prepareMailBody({ html, allowImages = false }) {
  const safe = hardenLinks(sanitizeMailHtml(html))

  if (allowImages) return { html: allowRemoteResources(safe), blocked: 0 }

  return blockRemoteResources(safe)
}
