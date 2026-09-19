import { describe, it, expect } from 'vitest'
import {
  MAIL_FRAME_HEIGHT_MESSAGE,
  MAIL_FRAME_MEASURE_BY_PARENT,
  MAIL_FRAME_MIN_HEIGHT,
  MAIL_FRAME_MIN_WIDTH,
  MAIL_FRAME_SANDBOX,
  MAIL_FRAME_SCRIPTS,
  buildMailFrameDocument,
  createFrameNonce,
  isOpenableLink,
  readFrameContentHeight,
} from '../src/utils/mail-frame.js'

/**
 * Minimal stand-in for a frame document.
 *
 * The numbers come from a real measurement in headless Chrome at 375px: a
 * one-line mail reports `documentElement.scrollHeight === 320` (the frame's own
 * height, i.e. the viewport floor) while the body correctly reports 24.
 */
function frameDoc({ rootScroll = 0, bodyScroll = 0, bodyRect = 0, wrapRect = 0, wrapOffset = 0 } = {}) {
  return {
    documentElement: { scrollHeight: rootScroll },
    body: {
      scrollHeight: bodyScroll,
      getBoundingClientRect: () => ({ height: bodyRect }),
    },
    querySelector: selector => (selector === '[data-nova-mail-body]'
      ? { getBoundingClientRect: () => ({ height: wrapRect }), offsetHeight: wrapOffset }
      : null),
  }
}

function build(html, options = {}) {
  return buildMailFrameDocument({ html, ...options })
}

describe('frame sandbox', () => {
  it('never grants allow-same-origin together with allow-scripts', () => {
    const tokens = MAIL_FRAME_SANDBOX.split(/\s+/)

    expect(tokens.includes('allow-same-origin') && tokens.includes('allow-scripts')).toBe(false)
  })

  it('never grants top navigation, forms, downloads or pointer lock', () => {
    for (const token of [
      'allow-top-navigation',
      'allow-top-navigation-by-user-activation',
      'allow-forms',
      'allow-modals',
      'allow-downloads',
      'allow-pointer-lock',
      'allow-storage-access-by-user-activation',
    ]) {
      expect(MAIL_FRAME_SANDBOX).not.toContain(token)
    }
  })

  it('lets links open in a new tab without escaping the sandbox permanently', () => {
    expect(MAIL_FRAME_SANDBOX).toContain('allow-popups')
    expect(MAIL_FRAME_SANDBOX).toContain('allow-popups-to-escape-sandbox')
  })

  it('reports the height mode that matches the sandbox it hands out', () => {
    if (MAIL_FRAME_SCRIPTS) {
      expect(MAIL_FRAME_SANDBOX).toContain('allow-scripts')
      expect(MAIL_FRAME_SANDBOX).not.toContain('allow-same-origin')
      expect(MAIL_FRAME_MEASURE_BY_PARENT).toBe(false)
    } else {
      expect(MAIL_FRAME_SANDBOX).not.toContain('allow-scripts')
      expect(MAIL_FRAME_SANDBOX).toContain('allow-same-origin')
      expect(MAIL_FRAME_MEASURE_BY_PARENT).toBe(true)
    }
  })
})

describe('frame document', () => {
  it('returns a standalone document, not a fragment to inject', () => {
    const { document } = build('<p>hello</p>')

    expect(document.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(document).toContain('<html')
    expect(document).toContain('<head>')
    expect(document).toContain('<body>')
    expect(document).toContain('<p>hello</p>')
  })

  it('runs no script at all in the default mode', () => {
    const { document } = build('<p>hello</p>')
    const { document: withPayload } = build('<script>alert(1)</script><img src=x onerror=alert(1)>')

    if (!MAIL_FRAME_SCRIPTS) {
      expect(document).not.toContain('<script')
      expect(withPayload).not.toContain('<script')
    }

    expect(withPayload).not.toMatch(/onerror/i)
    expect(withPayload).not.toMatch(/\son[a-z]+\s*=/i)
  })

  it('locks the document down with a restrictive CSP', () => {
    const { document } = build('<p>x</p>')

    expect(document).toContain('Content-Security-Policy')
    expect(document).toContain("default-src 'none'")
    expect(document).toContain("object-src 'none'")
    expect(document).toContain("frame-src 'none'")
    expect(document).toContain("form-action 'none'")
    expect(document).toContain("base-uri 'none'")
    expect(document).toContain("connect-src 'none'")

    if (MAIL_FRAME_SCRIPTS) {
      expect(document).toContain("script-src 'nonce-")
    } else {
      expect(document).toContain("script-src 'none'")
    }
  })

  it('never leaks parent-origin capabilities into the document', () => {
    const { document } = build('<p>x</p>')

    expect(document).not.toMatch(/localStorage/i)
    expect(document).not.toMatch(/sessionStorage/i)
    expect(document).not.toMatch(/document\.cookie/i)
    expect(document).not.toMatch(/window\.parent\.document/i)
  })

  it('blocks remote images by default and reports how many', () => {
    const built = build('<img src="https://track.example/a.gif"><img src="https://track.example/b.gif">')

    expect(built.blocked).toBe(2)
    expect(built.document).not.toMatch(/\ssrc="https:\/\/track\.example/)
    expect(built.document).toContain('data-nova-remote-src="https://track.example/a.gif"')
  })

  it('loads the remote images after the reader opts in', () => {
    const built = build('<img src="https://cdn.example/logo.png">', { allowImages: true })

    expect(built.blocked).toBe(0)
    expect(built.document).toContain('src="https://cdn.example/logo.png"')
  })

  it('strips xss payloads from inside the frame too', () => {
    const { document } = build(
      '<iframe src="https://evil.example"></iframe><object data="x"></object>' +
      '<form action="//evil.example"><input></form><a href="javascript:alert(1)">x</a>' +
      '<style>body{display:none}</style><base href="//evil.example">'
    )

    expect(document).not.toMatch(/<iframe/i)
    expect(document).not.toMatch(/<object/i)
    expect(document).not.toMatch(/<form/i)
    expect(document).not.toMatch(/<input/i)
    expect(document).not.toMatch(/javascript:/i)
    expect(document).not.toMatch(/<base/i)
    // Only the frame's own stylesheet remains.
    expect(document.match(/<style>/g)).toHaveLength(1)
  })

  it('keeps tables, inline css and links working', () => {
    const { document } = build(
      '<table width="600" style="border-collapse:collapse"><tr><td style="color:#123456">cell</td></tr></table>' +
      '<a href="https://example.com/page">link</a>'
    )

    expect(document).toContain('<table')
    expect(document).toContain('color: #123456')
    expect(document).toContain('href="https://example.com/page"')
    expect(document).toContain('target="_blank"')
    expect(document).toContain('rel="noopener noreferrer nofollow"')
  })

  it('switches the stylesheet with the reader theme', () => {
    expect(build('<p>x</p>', { theme: 'dark' }).document).toContain('color-scheme: dark')
    expect(build('<p>x</p>', { theme: 'light' }).document).toContain('color-scheme: light')
  })

  it('escapes an untrusted subject used as the document title', () => {
    const { document } = build('<p>x</p>', { title: '</title><script>alert(1)</script>' })

    expect(document).not.toContain('<script>alert(1)')
    expect(document).toContain('&lt;script&gt;')
  })

  it('builds a very large body without truncating it', () => {
    const huge = `<div>${'<p>line</p>'.repeat(50000)}</div>`
    const { document } = build(huge)

    expect(document.length).toBeGreaterThan(huge.length)
    expect(document).toContain('<p>line</p>')
  })

  it('produces an empty, still-valid document for an empty body', () => {
    const { document, blocked } = build('')

    expect(blocked).toBe(0)
    expect(document).toContain('<!DOCTYPE html>')
    expect(document).toContain('data-nova-mail-body="1"')
  })

  it('does not open the frame document itself up to network fetches of media', () => {
    const { document } = build('<video src="https://evil.example/x.mp4"></video>')

    // <video> is forbidden outright, so nothing is fetched.
    expect(document).not.toMatch(/<video/i)
    expect(document).not.toContain('https://evil.example/x.mp4')
  })
})

describe('frame helpers', () => {
  it('generates a distinct nonce every time', () => {
    const a = createFrameNonce()
    const b = createFrameNonce()

    expect(a).toMatch(/^[a-z0-9]+$/)
    expect(a).not.toBe(b)
  })

  it('exposes the height message contract used by the component', () => {
    expect(MAIL_FRAME_HEIGHT_MESSAGE).toBe('nova-mail-frame-height')
  })

  it('only considers safe links openable', () => {
    expect(isOpenableLink('https://example.com')).toBe(true)
    expect(isOpenableLink('mailto:a@b.example')).toBe(true)
    expect(isOpenableLink('javascript:alert(1)')).toBe(false)
  })

  it('gives the frame body its own formatting context, so its height includes margins', () => {
    expect(build('<p>x</p>').document).toContain('display: flow-root')
  })
})

describe('readFrameContentHeight', () => {
  it('measures the body, never the root element', () => {
    // `documentElement.scrollHeight` is floored by the viewport: on a frame that
    // is currently 320px tall a one-line mail reads 320 there and 24 on the body.
    expect(readFrameContentHeight(frameDoc({ rootScroll: 320, bodyScroll: 24 }), 375)).toBe(24)
  })

  it('refuses a reading taken before the frame has a usable width', () => {
    const doc = frameDoc({ bodyScroll: 888 })

    expect(readFrameContentHeight(doc, 0)).toBe(0)
    expect(readFrameContentHeight(doc, MAIL_FRAME_MIN_WIDTH - 1)).toBe(0)
    expect(readFrameContentHeight(doc, MAIL_FRAME_MIN_WIDTH)).toBe(888)
  })

  it('takes the largest of body and wrapper, so a collapsed margin cannot clip content', () => {
    expect(readFrameContentHeight(frameDoc({ bodyScroll: 100, wrapRect: 140 }), 375)).toBe(140)
    expect(readFrameContentHeight(frameDoc({ bodyScroll: 100, wrapOffset: 160 }), 375)).toBe(160)
    expect(readFrameContentHeight(frameDoc({ bodyRect: 70 }), 375)).toBe(70)
  })

  it('reports nothing for an unusable document', () => {
    expect(readFrameContentHeight(null, 375)).toBe(0)
    expect(readFrameContentHeight({}, 375)).toBe(0)
    expect(readFrameContentHeight(frameDoc({}), 375)).toBe(0)
  })

  it('discards a reading far taller than the frame is wide (sliver wrap)', () => {
    // A one-line mail once measured 888px while the card was still zero-wide. That
    // kind of reading must never stretch the card into a wall of blank space.
    expect(readFrameContentHeight(frameDoc({ bodyScroll: 30000 }), 375)).toBe(0)
    expect(readFrameContentHeight(frameDoc({ bodyScroll: 22501 }), 375)).toBe(0)
    // A genuinely long newsletter is still accepted.
    expect(readFrameContentHeight(frameDoc({ bodyScroll: 4000 }), 375)).toBe(4000)
  })

  it('keeps the floor small enough for a one-line mail', () => {
    // 24px of content is a real message, not a not-yet-laid-out document.
    expect(MAIL_FRAME_MIN_HEIGHT).toBeLessThan(24)
  })
})
