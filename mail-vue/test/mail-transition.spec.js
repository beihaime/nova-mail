/**
 * Mail open / close transition.
 *
 * The visual half is verified in a browser; these tests pin the state machine
 * that the list and the reader rely on: the layer is parked exactly on the
 * clicked preview, repeated clicks cannot stack layers, a flight always cleans
 * up after itself, and reduced motion opts out of the flying card entirely.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  abortMailTransition,
  captureListPreview,
  playReaderClose,
  playReaderOpen,
  readerUnmounted,
} from '@/utils/mail-transition.js'

const ROW_RECT = { top: 120, left: 0, width: 800, height: 48 }
const PANE_RECT = { top: 0, left: 0, width: 800, height: 600 }

function rectOf({ top, left, width, height }) {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() { return this },
  }
}

function stubRect(el, rect) {
  el.getBoundingClientRect = () => rectOf(rect)
  return el
}

function makeRow({ emailId = 7, rect = ROW_RECT } = {}) {
  const row = document.createElement('div')
  row.className = 'email-row'
  row.dataset.emailId = String(emailId)
  row.setAttribute('data-v-test', '')
  row.innerHTML = '<span class="name">Sender</span><span class="subject-text">Subject</span>'
  document.body.appendChild(row)
  return stubRect(row, rect)
}

function makeReader() {
  const reader = document.createElement('div')
  reader.className = 'mail-reader'
  reader.setAttribute('data-nova-mail-reader', '')
  document.body.appendChild(reader)
  return stubRect(reader, PANE_RECT)
}

const layer = () => document.querySelector('.nova-mail-fly-layer')
const surface = () => document.querySelector('.nova-mail-fly-surface')

const classes = () => document.documentElement.className

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

  // jsdom has neither the Web Animations API nor a rendering loop; the engine
  // only needs their promises to settle so its timers can do the bookkeeping.
  Element.prototype.animate = function animate() {
    return { finished: Promise.resolve(), cancel() {}, pause() {} }
  }
  globalThis.requestAnimationFrame = callback => setTimeout(() => callback(0), 0)

  vi.useFakeTimers()
})

afterEach(() => {
  abortMailTransition()
  vi.useRealTimers()
  document.body.innerHTML = ''
  document.documentElement.className = ''
})

describe('opening a preview', () => {
  it('parks a layer exactly on the clicked row and hides the reader', () => {
    const row = makeRow()

    expect(captureListPreview(row)).toBe(true)
    expect(layer()).toBeTruthy()
    expect(surface().style.width).toBe(`${ROW_RECT.width}px`)
    expect(surface().style.height).toBe(`${ROW_RECT.height}px`)
    expect(surface().style.top).toBe(`${ROW_RECT.top}px`)
    // The snapshot is a clone of the row, not the row itself.
    expect(layer().querySelector('.email-row')).toBeTruthy()
    expect(layer().querySelector('.email-row')).not.toBe(row)
    expect(layer().querySelector('.subject-text').textContent).toBe('Subject')
    expect(classes()).toContain('nova-mail-flying')
    expect(classes()).toContain('nova-mail-open')
  })

  it('never stacks a second layer while the card is already growing', () => {
    const reader = makeReader()
    const first = makeRow({ emailId: 1 })
    const second = makeRow({ emailId: 2 })

    captureListPreview(first)
    playReaderOpen(reader)
    expect(captureListPreview(second)).toBe(false)
    expect(document.querySelectorAll('.nova-mail-fly-layer').length).toBe(1)
  })

  it('cleans the flight state up once the reader has landed', () => {
    const reader = makeReader()
    captureListPreview(makeRow())
    playReaderOpen(reader)

    vi.advanceTimersByTime(1000)

    expect(layer()).toBeNull()
    expect(classes()).not.toContain('nova-mail-flying')
    expect(classes()).not.toContain('nova-mail-open')
  })

  it('drops a capture that never reached the reader', () => {
    captureListPreview(makeRow())
    expect(layer()).toBeTruthy()

    vi.advanceTimersByTime(2000)

    expect(layer()).toBeNull()
    expect(classes()).not.toContain('nova-mail-open')
  })

  it('does not fly at all when reduced motion is requested', () => {
    stubMatchMedia(true)
    const reader = makeReader()

    captureListPreview(makeRow())
    expect(layer()).toBeNull()

    playReaderOpen(reader)
    vi.advanceTimersByTime(1000)
    expect(layer()).toBeNull()
    expect(classes()).not.toContain('nova-mail-flying')
  })
})

describe('closing the reader', () => {
  it('flies back to the remembered preview and hands the layer over', async () => {
    const reader = makeReader()
    captureListPreview(makeRow())
    playReaderOpen(reader)

    vi.advanceTimersByTime(1000)

    const closed = playReaderClose(reader)
    expect(layer()).toBeTruthy()
    expect(classes()).toContain('nova-mail-closing')

    vi.advanceTimersByTime(1000)
    await closed

    // The pane is still mounted: the layer stands in for the preview until the
    // route change unmounts it.
    expect(layer()).toBeTruthy()

    readerUnmounted()
    vi.advanceTimersByTime(1000)

    expect(layer()).toBeNull()
    expect(classes()).not.toContain('nova-mail-closing')
  })

  it('falls back to a fade when there is no preview to return to', async () => {
    const reader = makeReader()

    const closed = playReaderClose(reader)
    expect(layer()).toBeNull()

    vi.advanceTimersByTime(1000)
    await closed

    readerUnmounted()
    expect(layer()).toBeNull()
    expect(classes()).not.toContain('nova-mail-flying')
  })

  it('is idempotent: a second close reuses the flight in progress', () => {
    const reader = makeReader()
    captureListPreview(makeRow())
    playReaderOpen(reader)
    vi.advanceTimersByTime(1000)

    const first = playReaderClose(reader)
    const second = playReaderClose(reader)
    expect(second).toBe(first)
    expect(document.querySelectorAll('.nova-mail-fly-layer').length).toBe(1)

    vi.advanceTimersByTime(1000)
  })

  it('falls back when the remembered preview is no longer in view', async () => {
    const reader = makeReader()
    // The row was scrolled out of the viewport when it was opened.
    captureListPreview(makeRow({ rect: { top: -400, left: 0, width: 800, height: 48 } }))
    playReaderOpen(reader)
    vi.advanceTimersByTime(1000)

    const closed = playReaderClose(reader)
    expect(layer()).toBeNull()
    vi.advanceTimersByTime(1000)
    await closed

    readerUnmounted()
    expect(layer()).toBeNull()
  })
})
