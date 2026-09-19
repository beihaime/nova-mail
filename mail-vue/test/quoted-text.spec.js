import { describe, it, expect } from 'vitest'
import {
  buildMessagePreview,
  quotedTextToHtml,
  stripMarkdown,
  wrapHtmlQuotes,
} from '../src/utils/quoted-text.js'

describe('stripMarkdown', () => {
  it('removes the syntax a one-line summary must not show', () => {
    expect(stripMarkdown('# Title')).toBe('Title')
    expect(stripMarkdown('## Sub **bold** and *italic*')).toBe('Sub bold and italic')
    expect(stripMarkdown('- one\n- two')).toBe('one\ntwo')
    expect(stripMarkdown('1. one\n2. two')).toBe('one\ntwo')
    expect(stripMarkdown('> quoted')).toBe('quoted')
    expect(stripMarkdown('`code`')).toBe('code')
    expect(stripMarkdown('[label](https://example.com)')).toBe('label')
    expect(stripMarkdown('![alt](https://example.com/a.png)')).toBe('alt')
    expect(stripMarkdown('~~gone~~')).toBe('gone')
    expect(stripMarkdown('---')).toBe('')
  })

  it('leaves ordinary prose (and snake_case) alone', () => {
    expect(stripMarkdown('Plain sentence with a_b_c and 2 * 3 = 6.')).toBe('Plain sentence with a_b_c and 2 * 3 = 6.')
  })
})

describe('buildMessagePreview', () => {
  it('summarises a markdown body without its syntax', () => {
    const preview = buildMessagePreview({
      bodyType: 'text/markdown',
      text: '# Release notes\n\n- **Breaking**: the API moved\n\n> old quote',
    })

    expect(preview).toBe('Release notes')
  })

  it('keeps quoted history out of a markdown summary', () => {
    const preview = buildMessagePreview({
      bodyType: 'text/markdown',
      text: 'Fresh news\n\nOn Monday, Alice wrote:\n> the old thread',
    })

    expect(preview).toBe('Fresh news')
  })

  it('still summarises html and plain bodies', () => {
    expect(buildMessagePreview({ bodyType: 'text/plain', text: 'hello there' })).toBe('hello there')
    expect(buildMessagePreview({ bodyType: 'text/html', content: '<p>html body</p>' })).toBe('html body')
  })
})

describe('body rendering helpers', () => {
  it('escapes plain text and collapses the quoted history', () => {
    const html = quotedTextToHtml('new text\n> old text', '… show quoted')

    expect(html).toContain('new text')
    expect(html).toContain('<details class="quote-toggle"')
    expect(html).not.toContain('> old text')
    expect(html).toContain('old text')
  })

  it('never lets markup through from a plain-text body', () => {
    const html = quotedTextToHtml('<img src=x onerror=alert(1)>', '…')

    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('wraps an html quote in a collapsed details block', () => {
    const html = wrapHtmlQuotes('<p>new</p><blockquote><p>old</p></blockquote>', '…')

    expect(html).toContain('<p>new</p>')
    expect(html).toContain('<details class="quote-toggle"')
    expect(html).toContain('old')
  })

  it('leaves an html body without a quote untouched', () => {
    const source = '<p>no quotes here</p>'
    expect(wrapHtmlQuotes(source, '…')).toBe(source)
  })
})
