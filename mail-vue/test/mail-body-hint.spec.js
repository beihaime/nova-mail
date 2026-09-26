import { describe, expect, it } from 'vitest'
import { HTML_TAG_THRESHOLD, looksLikeHtmlDocument } from '../src/utils/mail-body-hint.js'
import { buildMessagePreview } from '../src/utils/quoted-text.js'

describe('looksLikeHtmlDocument', () => {
  it('recognises a whole document', () => {
    expect(looksLikeHtmlDocument('<!DOCTYPE html><html><body>hi</body></html>')).toBe(true)
    expect(looksLikeHtmlDocument('<html><body>hi</body></html>')).toBe(true)
    expect(looksLikeHtmlDocument('  \n<html lang="en"><body>x</body></html>')).toBe(true)
  })

  it('recognises a tag-rich fragment', () => {
    expect(looksLikeHtmlDocument('<div><p>a</p><table><tr><td>b</td></tr></table></div>')).toBe(true)
    expect(looksLikeHtmlDocument('<h1>Title</h1><p>Body</p><br>')).toBe(true)
  })

  it('leaves prose alone, including prose that mentions a tag', () => {
    expect(looksLikeHtmlDocument('Hello, plain text body.')).toBe(false)
    expect(looksLikeHtmlDocument('Use <b> for bold in HTML.')).toBe(false)
    expect(looksLikeHtmlDocument('Compare a < b and c > d.')).toBe(false)
    expect(looksLikeHtmlDocument('See <a href="x">this</a> link.')).toBe(false)
    expect(looksLikeHtmlDocument('')).toBe(false)
    expect(looksLikeHtmlDocument(null)).toBe(false)
  })

  it('needs at least the declared number of tags for a fragment', () => {
    expect(HTML_TAG_THRESHOLD).toBe(3)
    // Two tags is a fragment; four is markup.
    expect(looksLikeHtmlDocument('<b>x</b>')).toBe(false)
    expect(looksLikeHtmlDocument('<b>x</b><i>y</i>')).toBe(true)
  })
})

describe('preview of a markup body stored as text', () => {
  it('summarises the rendered text, never the tags', () => {
    const preview = buildMessagePreview({
      bodyType: 'text/plain',
      text: '<html><body><h1>Hello</h1><p>This is HTML mail.</p></body></html>',
    })

    // The summary is the first paragraph of the *rendered* text.
    expect(preview).toBe('Hello')
    expect(preview).not.toContain('<')
  })

  it('still summarises ordinary plain text', () => {
    expect(buildMessagePreview({ bodyType: 'text/plain', text: 'Just a plain sentence.' }))
      .toBe('Just a plain sentence.')
  })
})
