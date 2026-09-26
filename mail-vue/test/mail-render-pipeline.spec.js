import { describe, expect, it } from 'vitest'
import {
  MAIL_BODY_TYPE,
  prepareMailBody,
  prepareMarkdownBody,
  renderInlineMarkdown,
  sanitizeMailHtml,
} from '../src/utils/mail-html.js'

/**
 * The render path, not just the sanitizer.
 *
 * `mail-html.spec.js` checks what `sanitizeMailHtml` returns as a string. This
 * file checks what the browser does with it: each result is assigned to a real
 * element's `innerHTML` and inspected as a DOM, which is the only way to catch
 * mutation-XSS shapes where the sanitized string re-parses into something
 * dangerous.
 */

/** Render markup the way the reader does, then hand back the live DOM. */
function render(html) {
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

function assertInert(container) {
  const elements = Array.from(container.querySelectorAll('*'))

  for (const element of elements) {
    const tag = element.tagName.toLowerCase()
    expect(['script', 'iframe', 'object', 'embed', 'style', 'link', 'base', 'meta'], tag).not.toContain(tag)

    const attributes = Array.from(element.attributes, (attribute) => attribute.name.toLowerCase())
    expect(attributes.filter((name) => name.startsWith('on')), tag).toEqual([])
  }
}

const RENDER_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<a href="javascript:alert(1)">x</a>',
  '<div style="background:url(javascript:alert(1))">x</div>',
  '<style>@import url(//evil.example/x.css);</style>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">x</p></noscript>',
  '<!--[if IE]><script>alert(1)</script><![endif]-->',
  '<![CDATA[<script>alert(1)</script>]]>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
]

describe('rendered HTML bodies are inert', () => {
  it.each(RENDER_PAYLOADS)('stays inert after rendering %s', (payload) => {
    const prepared = prepareMailBody({ html: payload })

    assertInert(render(prepared.html))
    expect(prepared.html).not.toMatch(/javascript:/i)
  })

  it('renders an HTML body without executing or fetching anything', () => {
    const prepared = prepareMailBody({
      html: '<h1>Hi</h1><script>alert(1)</script><img src="https://track.example/open.gif">',
    })

    const container = render(prepared.html)

    expect(container.querySelector('h1')?.textContent).toBe('Hi')
    assertInert(container)
    // The tracking pixel is parked, not fetched.
    expect(prepared.blocked).toBe(1)
    expect(container.querySelector('img')?.getAttribute('src')).toBeFalsy()
    expect(container.querySelector('img')?.getAttribute('data-nova-remote-src')).toBe(
      'https://track.example/open.gif',
    )
  })

  it('keeps the parked attribute the reader needs to opt back in', () => {
    const prepared = prepareMailBody({ html: '<img src="https://track.example/a.gif">' })
    const container = render(prepared.html)

    // If the sanitizer stripped data-nova-remote-src, "show images" would break.
    expect(container.querySelector('img')?.dataset.novaRemoteSrc).toBe('https://track.example/a.gif')
  })

  it('renders safe presentation markup untouched', () => {
    const prepared = prepareMailBody({
      html: '<table><tr><td style="color:#333;padding:8px"><strong>bold</strong></td></tr></table>',
    })
    const container = render(prepared.html)

    expect(container.querySelector('table')).toBeTruthy()
    expect(container.querySelector('strong')?.textContent).toBe('bold')
  })
})

describe('inline markdown (subjects and previews) is inert', () => {
  it.each([
    '<img src=x onerror=alert(1)>',
    '[x](javascript:alert(1))',
    '<script>alert(1)</script>',
    '<svg onload=alert(1)>',
  ])('neutralises %s', (payload) => {
    const html = renderInlineMarkdown(payload)
    assertInert(render(html))
  })

  it('keeps emphasis but escapes tags', () => {
    const html = renderInlineMarkdown('**bold** <b>not markup</b>')

    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('&lt;b&gt;')
  })
})

describe('markdown bodies render safely', () => {
  it('renders a markdown body whose link and image are hostile', () => {
    const prepared = prepareMarkdownBody(
      '# Title\n\n[bad](javascript:alert(1)) ![px](https://track.example/open.gif)',
    )
    const container = render(prepared.html)

    expect(container.querySelector('h1')?.textContent).toBe('Title')
    assertInert(container)
    expect(prepared.blocked).toBe(1)

    const anchors = Array.from(container.querySelectorAll('a'))
    for (const anchor of anchors) {
      expect(anchor.getAttribute('href') || '').not.toMatch(/^javascript:/i)
    }
  })

  it('does not resurrect a payload when remote images are allowed', () => {
    const prepared = prepareMarkdownBody('<img src=x onerror=alert(1)> ![px](https://t.example/a.gif)', {
      allowImages: true,
    })

    assertInert(render(prepared.html))
    expect(render(prepared.html).querySelector('img')?.getAttribute('src')).toBe('https://t.example/a.gif')
  })
})

describe('body-type contract for the renderer', () => {
  it('matches the values the Worker stores', () => {
    expect(MAIL_BODY_TYPE).toEqual({
      HTML: 'text/html',
      MARKDOWN: 'text/markdown',
      PLAIN: 'text/plain',
    })
  })

  it('returns an empty string, not markup, for an empty body', () => {
    expect(sanitizeMailHtml('')).toBe('')
    expect(prepareMailBody({ html: '' }).html).toBe('')
  })
})
