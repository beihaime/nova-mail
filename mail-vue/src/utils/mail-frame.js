import { isSafeUrl, prepareMailBody } from './mail-html'

/**
 * Builds the standalone document that a mail's HTML body is rendered in.
 *
 * The body never touches the application DOM: it is sanitized (see
 * `mail-html.js`), wrapped in its own `<html>` document with its own stylesheet
 * and CSP, and handed to an `<iframe sandbox>` through `srcdoc`. A mail body can
 * therefore not read the session, the store, LocalStorage, cookies or the Vue
 * tree — it only ever gets a private document.
 *
 * The document is a plain string so the whole thing is unit testable without a
 * browser (see `test/mail-frame.spec.js`).
 */

/** Height reports sent from inside the frame (only in scripts mode). */
export const MAIL_FRAME_HEIGHT_MESSAGE = 'nova-mail-frame-height'

/**
 * A frame narrower than this has not been laid out yet.
 *
 * Measured at zero width every line wraps to a single word or character, which
 * inflates the content to hundreds of pixels for a one-line mail. A phone card
 * that is still opening hits exactly this, so such a reading must be discarded
 * rather than trusted.
 */
export const MAIL_FRAME_MIN_WIDTH = 80

/** Below this there is no content to show yet; the fixed fallback stays. */
export const MAIL_FRAME_MIN_HEIGHT = 8

/**
 * A mail taller than this many times the frame width was wrapped into a sliver.
 *
 * At 375px that is over sixty screens of mail, so the only readings that reach it
 * come from content laid out at a width it no longer has (a card that was still
 * 0-wide while the frame loaded). Such a reading is discarded rather than
 * stretching the card into a wall of blank space.
 */
export const MAIL_FRAME_MAX_RATIO = 60

/**
 * Allow script inside the frame?
 *
 * Auto-height has one structural requirement: somebody has to read the rendered
 * height of the mail, and a sandboxed frame with `allow-same-origin` withheld is
 * an opaque origin the parent cannot inspect. There are exactly two ways out:
 *
 *   `false` (default) — no script may run in the frame at all. The parent reads
 *     `contentDocument.documentElement.scrollHeight` directly, which requires
 *     `allow-same-origin`. `script-src 'none'` plus the missing `allow-scripts`
 *     token block execution twice over, so the origin sharing stays inert.
 *     Nothing attacker-controlled ever executes.
 *
 *   `true` — the frame gets an opaque origin (`allow-scripts` without
 *     `allow-same-origin`) and reports its height through `postMessage`. This is
 *     the strongest isolation: even a sanitizer bypass could not reach the
 *     application. It costs one inline script in the frame, guarded by a nonce
 *     CSP so only our own reporter runs.
 *
 * Flipping this constant is the only change needed; both modes are supported by
 * the component and the reader.
 */
export const MAIL_FRAME_SCRIPTS = false

/** Sandbox tokens shared by both modes: links may open, nothing else may. */
const BASE_SANDBOX_TOKENS = ['allow-popups', 'allow-popups-to-escape-sandbox']

/**
 * The `sandbox` attribute for the reader's iframe.
 *
 * Never contains `allow-same-origin` *and* `allow-scripts` together: that
 * combination would let the frame remove its own sandbox attribute.
 */
export const MAIL_FRAME_SANDBOX = (MAIL_FRAME_SCRIPTS
  ? ['allow-scripts', ...BASE_SANDBOX_TOKENS]
  : ['allow-same-origin', ...BASE_SANDBOX_TOKENS]).join(' ')

/** True when the parent is expected to measure the frame itself. */
export const MAIL_FRAME_MEASURE_BY_PARENT = !MAIL_FRAME_SCRIPTS

/* ------------------------------------------------------------------ helpers */

function escapeAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** `'self'`-free CSP: no network, no forms, no frames, no plugins. */
function buildCsp(nonce) {
  const scriptPolicy = MAIL_FRAME_SCRIPTS && nonce ? `'nonce-${nonce}'` : "'none'"

  return [
    "default-src 'none'",
    // Remote images are only ever present after the reader opted in; while they
    // are blocked the `src` attribute has been removed, so nothing is fetched.
    'img-src data: blob: https: http:',
    'media-src data: blob:',
    'font-src data:',
    "style-src 'unsafe-inline'",
    `script-src ${scriptPolicy}`,
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ')
}

/** Escape text for the plain-text fallback rendered inside the frame. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Random nonce for the height reporter; `Math.random` is fine as a fallback. */
export function createFrameNonce() {
  const globalCrypto = typeof crypto !== 'undefined' ? crypto : null

  if (globalCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16)
    globalCrypto.getRandomValues(bytes)
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  }

  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * The frame's own stylesheet.
 *
 * Mail HTML is written for email clients: it leans on tables, inline styles and
 * hard-coded pixel widths. These rules keep that markup readable (and stop it
 * from overflowing a phone) without overriding what the sender explicitly set.
 */
function buildFrameStyle(theme) {
  const dark = theme === 'dark'

  const text = dark ? '#e6e6e6' : '#13181d'
  const link = dark ? '#7cb0f0' : '#0e70df'
  const quoteLine = dark ? '#4a4a4a' : '#c7cdd4'
  const quoteText = dark ? '#a8a8a8' : '#5f6368'

  return `
    html { color-scheme: ${dark ? 'dark' : 'light'}; }
    html, body { margin: 0; padding: 0; background: transparent; }
    body {
      font-family: Inter, "Helvetica Neue", Helvetica, "PingFang SC",
                   "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", Arial, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      color: ${text};
      word-break: break-word;
      overflow-wrap: anywhere;
      /* Own formatting context: the wrapper's height then includes its
         children's margins, which is what the height measurement reads. */
      display: flow-root;
    }
    /* A mail laid out at a fixed pixel width must never produce a horizontal
       scrollbar: the top-level blocks are capped to the available width. */
    body > * { max-width: 100% !important; box-sizing: border-box; }
    /* Own formatting context: children's margins stay inside, so this element's
       height is exactly the mail's height — it is what the reader measures. */
    .nova-mail-body { display: flow-root; }
    /* Plain-text alternative, shown only when the markup had nothing to render. */
    .nova-fallback { margin: 0; font: inherit; color: inherit; white-space: pre-wrap; word-break: break-word; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; border-collapse: collapse; }
    td, th { max-width: 100%; }
    h1, h2, h3, h4 { font-size: 18px; font-weight: 700; margin: 12px 0 6px; }
    p { margin: 0 0 10px; }
    a { color: ${link}; text-decoration: none; }
    a:hover { text-decoration: underline; }
    pre { white-space: pre-wrap; word-break: break-word; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    hr { border: 0; border-top: 1px solid ${quoteLine}; }

    /* Gmail-style quoted history. The wrapper is added by
       utils/quoted-text.js; <details> expands natively, so no script is needed. */
    blockquote, .nova-quoted, .quote-block {
      margin: 6px 0 0 8px;
      padding: 0 0 0 12px;
      border-left: 2px solid ${quoteLine};
      color: ${quoteText};
    }
    blockquote > :first-child,
    .nova-quoted > :first-child,
    .quote-block > :first-child { margin-top: 0; }

    details.quote-toggle { margin-top: 10px; }
    details.quote-toggle > summary.quote-toggle-summary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 0;
      color: ${quoteText};
      font-size: 13px;
      cursor: pointer;
      list-style: none;
      user-select: none;
    }
    details.quote-toggle > summary.quote-toggle-summary::-webkit-details-marker { display: none; }
    details.quote-toggle > summary.quote-toggle-summary::marker { content: ''; }
    details.quote-toggle[open] > summary.quote-toggle-summary { margin-bottom: 6px; }
    details.quote-toggle > .quote-content { display: block; }

    @media (max-width: 767px) {
      blockquote, .nova-quoted, .quote-block { margin-left: 4px; padding-left: 8px; }
    }
  `
}

/** Inline reporter: measures the document and posts the height to the parent. */
function buildHeightReporter(nonce) {
  return `<script nonce="${escapeAttribute(nonce)}">
(function () {
  var TYPE = '${MAIL_FRAME_HEIGHT_MESSAGE}';
  var last = -1;

  function measure() {
    var el = document.documentElement;
    var body = document.body;
    var height = Math.max(
      el ? el.scrollHeight : 0,
      el ? el.offsetHeight : 0,
      body ? body.scrollHeight : 0,
      body ? body.offsetHeight : 0
    );
    if (!height || height === last) return;
    last = height;
    try {
      parent.postMessage({ type: TYPE, height: height }, '*');
    } catch (e) { /* parent gone */ }
  }

  function schedule() { window.requestAnimationFrame(measure); }

  window.addEventListener('load', schedule);
  window.addEventListener('resize', schedule);
  document.addEventListener('DOMContentLoaded', schedule);

  if (typeof ResizeObserver !== 'undefined') {
    var observer = new ResizeObserver(schedule);
    document.addEventListener('DOMContentLoaded', function () {
      observer.observe(document.documentElement);
      if (document.body) observer.observe(document.body);
    });
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule).catch(function () {});
  for (var i = 0; i < 6; i++) setTimeout(schedule, 50 * (i + 1));
})();
</script>`
}

/* ------------------------------------------------------------- the document */

/**
 * Turn an untrusted mail body into the sandboxed document for `srcdoc`.
 *
 * @param {object} params
 * @param {string} params.html raw mail body (already HTML, not markdown)
 * @param {boolean} [params.allowImages] reader allowed remote images
 * @param {'light'|'dark'} [params.theme] reader theme
 * @param {string} [params.nonce] nonce for the height reporter
 * @param {string} [params.title] document title (subject); untrusted
 * @returns {{document: string, blocked: number, sandbox: string, nonce: string}}
 */
export function buildMailFrameDocument({
  html,
  allowImages = false,
  theme = 'light',
  nonce = '',
  title = '',
  fallbackText = '',
} = {}) {
  const frameNonce = MAIL_FRAME_SCRIPTS ? (nonce || createFrameNonce()) : ''

  // Sanitize, harden every link and hold remote resources back until the reader
  // asks for them. This is the only path from mail HTML to the frame.
  const { html: safeHtml, blocked } = prepareMailBody({ html, allowImages })

  // Markup that sanitizes to nothing, or none at all: show the text alternative
  // inside the frame rather than an empty body. The reader keeps its single
  // HTML renderer, so nothing has to switch renderers mid-flight.
  const fallback = safeHtml.trim() ? '' : escapeHtml(String(fallbackText || ''))

  const reporter = MAIL_FRAME_SCRIPTS ? buildHeightReporter(frameNonce) : ''

  const document = `<!DOCTYPE html>
<html lang="und">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(buildCsp(frameNonce))}">
<title>${escapeAttribute(title)}</title>
<style>${buildFrameStyle(theme)}</style>
</head>
<body>
<div class="nova-mail-body" data-nova-mail-body="1">${safeHtml}${fallback ? `<pre class="nova-fallback">${fallback}</pre>` : ''}</div>
${reporter}
</body>
</html>`

  return {
    document,
    blocked,
    sandbox: MAIL_FRAME_SANDBOX,
    nonce: frameNonce,
    // How much of the body survived sanitizing. Zero for a mail whose markup the
    // sanitizer removed entirely (or one that arrived empty); the reader uses it
    // to fall back to the plain-text alternative instead of showing a blank frame.
    sanitizedLength: safeHtml.length + fallback.length,
  }
}

/** True when a link target may be opened outside the reader. */
export function isOpenableLink(href) {
  return isSafeUrl(href)
}

/**
 * Height the mail occupies inside a frame document, in CSS pixels.
 *
 * Read from the content wrapper only. Neither the root element nor `body` can be
 * trusted: both are stretched to the viewport, so their height is at least the
 * frame's current height — a reading that can never shrink and would leave the
 * frame taller than the mail inside it. Measured on a Chrome Android device:
 * `documentElement` 301, `body` 301, content wrapper 286.
 *
 * @param {Document} doc the frame's content document
 * @param {number} clientWidth the frame's laid-out width
 * @returns {number} content height, or 0 when the frame has no usable layout yet
 */
export function readFrameContentHeight(doc, clientWidth) {
  if (!doc?.documentElement) return 0

  const width = clientWidth || 0
  if (width < MAIL_FRAME_MIN_WIDTH) return 0

  const content = doc.querySelector?.('[data-nova-mail-body]')
  const height = content
    ? Math.max(content.getBoundingClientRect?.().height || 0, content.offsetHeight || 0)
    : 0

  // No wrapper, or a wrapper holding nothing: the frame has either no content or
  // no layout yet, and there is nothing to measure. Falling back to `body` here
  // was worse than useless — `body` is stretched to the frame's own viewport, so
  // it reported the height the frame already had (observed: exactly 150px, the
  // fallback) and the frame was then marked as measured and locked at it.
  if (height <= 0) return 0

  // A reading this far beyond the width is a sliver-wrap artefact, not a mail.
  if (height > width * MAIL_FRAME_MAX_RATIO) return 0

  return height
}

export default {
  MAIL_FRAME_SANDBOX,
  MAIL_FRAME_HEIGHT_MESSAGE,
  MAIL_FRAME_MIN_WIDTH,
  MAIL_FRAME_MIN_HEIGHT,
  MAIL_FRAME_MAX_RATIO,
  MAIL_FRAME_SCRIPTS,
  MAIL_FRAME_MEASURE_BY_PARENT,
  buildMailFrameDocument,
  createFrameNonce,
  isOpenableLink,
  readFrameContentHeight,
}
