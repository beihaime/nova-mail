/**
 * Lightweight mail reader transition.
 *
 * The list and reader are different routes. This module intentionally owns no
 * geometry and keeps no snapshot of the list: opening changes route normally,
 * while the mounted reader fades in; closing fades it out before navigation.
 */
import '@/styles/mail-transition.css'

const OPEN_DURATION = 160
const CLOSE_DURATION = 140
const CLOSE_CLEANUP_DELAY = 220
const OPEN_CLASS = 'nova-mail-reader-opening'
const CLOSE_CLASS = 'nova-mail-reader-closing'

let closePromise = null
let transitionToken = 0

function root() { return document.documentElement }

function reducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function clearClasses(reader) {
  reader?.classList.remove(OPEN_CLASS, CLOSE_CLASS)
  root().classList.remove(OPEN_CLASS, CLOSE_CLASS)
}

function wait(duration, token, onDone) {
  return new Promise(resolve => {
    window.setTimeout(() => {
      if (token === transitionToken) onDone?.()
      resolve()
    }, reducedMotion() ? 1 : duration)
  })
}

/** Start the reader's lightweight enter transition after it has mounted. */
export function playReaderOpen(reader) {
  if (!reader) return
  transitionToken += 1
  closePromise = null
  clearClasses(reader)
  if (reducedMotion()) return

  reader.classList.add(OPEN_CLASS)
  root().classList.add(OPEN_CLASS)
  window.setTimeout(() => {
    if (reader.isConnected) clearClasses(reader)
  }, OPEN_DURATION)
}

/** Fade the reader out before navigation; no list row is measured or retained. */
export function playReaderClose(reader) {
  if (closePromise) return closePromise
  const token = ++transitionToken
  if (!reader) return Promise.resolve()

  clearClasses(reader)
  if (reducedMotion()) return Promise.resolve()

  reader.classList.add(CLOSE_CLASS)
  root().classList.add(CLOSE_CLASS)

  closePromise = wait(CLOSE_DURATION, token, () => {
    // If navigation is cancelled, restore the reader after the visual close.
    window.setTimeout(() => {
      if (reader.isConnected && token === transitionToken) clearClasses(reader)
    }, CLOSE_CLEANUP_DELAY)
  }).finally(() => { closePromise = null })

  return closePromise
}

/** Safety cleanup for route changes that bypass the close guard. */
export function readerUnmounted(reader) {
  transitionToken += 1
  closePromise = null
  clearClasses(reader)
}
