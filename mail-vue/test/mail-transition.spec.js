/** Lightweight reader open / close transition. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  playReaderClose,
  playReaderOpen,
  readerUnmounted,
} from '@/utils/mail-transition.js'

function makeReader() {
  const reader = document.createElement('div')
  reader.className = 'mail-reader'
  document.body.appendChild(reader)
  return reader
}

function stubMatchMedia(reduce) {
  window.matchMedia = query => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.documentElement.className = ''
  stubMatchMedia(false)
  vi.useFakeTimers()
})

afterEach(() => {
  readerUnmounted(document.querySelector('.mail-reader'))
  vi.useRealTimers()
  document.body.innerHTML = ''
  document.documentElement.className = ''
})

describe('opening the reader', () => {
  it('uses a short independent fade without creating a layer', () => {
    const reader = makeReader()

    playReaderOpen(reader)

    expect(reader.classList.contains('nova-mail-reader-opening')).toBe(true)
    expect(document.querySelector('.nova-mail-fly-layer')).toBeNull()
    expect(document.documentElement.classList.contains('nova-mail-reader-opening')).toBe(true)

    vi.advanceTimersByTime(160)
    expect(reader.classList.contains('nova-mail-reader-opening')).toBe(false)
  })

  it('does not translate or animate when reduced motion is requested', () => {
    stubMatchMedia(true)
    const reader = makeReader()

    playReaderOpen(reader)

    expect(reader.classList.contains('nova-mail-reader-opening')).toBe(false)
    expect(document.documentElement.className).toBe('')
  })
})

describe('closing the reader', () => {
  it('fades out in place and does not create a reverse layer', async () => {
    const reader = makeReader()
    const closed = playReaderClose(reader)

    expect(reader.classList.contains('nova-mail-reader-closing')).toBe(true)
    expect(document.querySelector('.nova-mail-fly-layer')).toBeNull()

    vi.advanceTimersByTime(140)
    await closed

    expect(reader.classList.contains('nova-mail-reader-closing')).toBe(true)
    readerUnmounted(reader)
    expect(reader.classList.contains('nova-mail-reader-closing')).toBe(false)
  })

  it('is idempotent during a rapid repeated close', () => {
    const reader = makeReader()
    const first = playReaderClose(reader)
    expect(playReaderClose(reader)).toBe(first)
    vi.advanceTimersByTime(140)
  })

  it('skips the close animation for reduced motion', async () => {
    stubMatchMedia(true)
    const reader = makeReader()

    await playReaderClose(reader)

    expect(reader.classList.contains('nova-mail-reader-closing')).toBe(false)
    expect(document.documentElement.className).toBe('')
  })
})
