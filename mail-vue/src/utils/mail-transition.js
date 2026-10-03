/**
 * Mail open / close transition — shared-container (FLIP) between a list preview
 * and the reader.
 *
 * The reader is a route of its own, so by the time it mounts the row that was
 * clicked is already gone. The sequence is therefore:
 *
 *   open   captureListPreview(row)   ← synchronous, inside the click handler:
 *                                      snapshot the row and park a fixed layer
 *                                      exactly on top of it, before the list
 *                                      disappears. Also hides the reader that is
 *                                      about to mount, so it cannot flash.
 *          playReaderOpen(reader)    ← the reader mounted: grow the layer from
 *                                      the preview rect to the reader rect,
 *                                      then stagger the reader in
 *
 *   close  playReaderClose(reader)   ← awaited by the reader's leave guard, so
 *                                      the route only changes once the card has
 *                                      landed: collapse the real reader back onto
 *                                      the remembered preview rect while its
 *                                      parts fade, then cross-fade the parked
 *                                      preview in
 *          readerUnmounted()         ← the route changed: keep the preview layer
 *                                      until the real row is back in the DOM
 *                                      (the list may have to refetch), then hand
 *                                      over and drop the layer
 *
 * Only a picture of the row (a DOM clone) flies, and nothing is scaled: the
 * boxes are resized, so no real content is ever squashed and no iframe/canvas
 * body is cloned. Colours, radii and shadows are sampled from the live elements,
 * so the flight follows the active theme.
 */

import '@/styles/mail-transition.css'

/** Card flight. Quick off the mark, settling gently at the end. */
const FLIGHT = 340
const EASE = 'cubic-bezier(.2, 0, 0, 1)'
/** The reader starts arriving before the card has finished growing. */
const REVEAL_DELAY = 200
/** How long the preview snapshot stays legible while the card grows. */
const CONTENT_FADE_DELAY = 70
const CONTENT_FADE = 190
/** A flight that never reaches its other half must not leave state behind. */
const PENDING_TIMEOUT = 1400
/** How long a finished close waits for the route to actually change. */
const UNMOUNT_TIMEOUT = 1400
/** How long the parked preview waits for the list row to come back. */
const HANDOFF_TIMEOUT = 700
const HANDOFF_MOVE = 160
/** Fallback fades: no usable preview rect (deep link, scrolled away) / reduced
 *  motion. */
const FALLBACK_FADE = 150
const REDUCED_FADE = 120
/** A card-like corner while the surface is in flight. Both ends keep their own
 *  radius, so the hand-over to the real UI stays seamless. */
const MID_RADIUS = 10

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'

let flight = null
/** Last preview capture, kept so the close can fly back to where it started. */
let lastSource = null
let closePromise = null
let watchdog = 0
let timers = []
let resizeBound = false
let layer = null
let surface = null
let contentHost = null

const root = () => document.documentElement

function after(ms, fn) {
  const id = setTimeout(fn, ms)
  timers.push(id)
  return id
}

function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
}

function clearWatchdog() {
  if (watchdog) clearTimeout(watchdog)
  watchdog = 0
}

function setClasses(add, remove) {
  const el = root()
  remove.forEach(name => el.classList.remove(name))
  add.forEach(name => el.classList.add(name))
}

function prefersReduced() {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCE_QUERY).matches
}

/** Snapshot a rect into plain numbers: a DOMRect is live and goes stale. */
function snapshotRect(rect) {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

function rectOf(el) {
  if (!el || !el.getBoundingClientRect) return null
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return snapshotRect(rect)
}

/** Nearest painted background. The row and the reader are transparent over
 *  different surfaces, so the flying card has to carry the right one. */
function paintedBackground(el) {
  for (let node = el; node && node !== root(); node = node.parentElement) {
    const bg = getComputedStyle(node).backgroundColor
    if (bg && bg !== 'transparent' && !/, *0\)$/.test(bg)) return bg
  }
  return getComputedStyle(document.body).backgroundColor || 'transparent'
}

function cornerRadius(el) {
  return el ? parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 : 0
}

function boxShadow(el) {
  const shadow = el ? getComputedStyle(el).boxShadow : ''
  return !shadow || shadow === 'none' ? '0 0 0 0 rgba(0, 0, 0, 0)' : shadow
}

/** Theme-aware lift for the middle of the flight, read from the live custom
 *  property so dark and light each get their own value. */
function midShadow() {
  const value = getComputedStyle(root()).getPropertyValue('--el-box-shadow-light').trim()
  return value || '0 8px 24px rgba(0, 0, 0, .16)'
}

function withinViewport(rect) {
  return rect.top + rect.height > 0
      && rect.left + rect.width > 0
      && rect.top < window.innerHeight
      && rect.left < window.innerWidth
}

function sameRect(a, b, tolerance = 2) {
  return Math.abs(a.top - b.top) <= tolerance
      && Math.abs(a.left - b.left) <= tolerance
      && Math.abs(a.width - b.width) <= tolerance
      && Math.abs(a.height - b.height) <= tolerance
}

function animate(el, keyframes, options) {
  if (!el?.animate) return Promise.resolve()
  return el.animate(keyframes, { easing: EASE, fill: 'forwards', ...options }).finished.catch(() => {})
}

function removeLayer() {
  layer?.remove()
  layer = null
  surface = null
  contentHost = null
}

/**
 * The fixed animation layer: a surface laid out at the preview size with a
 * snapshot of the preview inside. Its box is what grows, never a `scale` — the
 * row owns a fixed height, so the snapshot keeps its natural size (and the
 * sender/subject/avatar stay crisp) while the card around it unfolds. The layer
 * is never interactive.
 */
function buildLayer(source) {
  removeLayer()

  const scope = [...source.row.attributes]
      .map(attr => attr.name)
      .find(name => name.startsWith('data-v-'))

  layer = document.createElement('div')
  layer.className = 'nova-mail-fly-layer'
  layer.setAttribute('aria-hidden', 'true')

  surface = document.createElement('div')
  surface.className = 'nova-mail-fly-surface'
  surface.style.top = `${source.rect.top}px`
  surface.style.left = `${source.rect.left}px`
  surface.style.width = `${source.rect.width}px`
  surface.style.height = `${source.rect.height}px`
  surface.style.borderRadius = `${source.radius}px`
  surface.style.boxShadow = source.shadow
  surface.style.backgroundColor = source.background

  contentHost = document.createElement('div')
  contentHost.className = 'nova-mail-fly-content'
  // The clone keeps its own scoped attributes, but this list's row styles are
  // written as `[data-v-…] .email-row`: without the same scope id on an ancestor
  // the snapshot would lose its real appearance.
  if (scope) contentHost.setAttribute(scope, '')
  contentHost.appendChild(source.row)

  surface.appendChild(contentHost)
  layer.appendChild(surface)
  document.body.appendChild(layer)
}

function fadeOutLayer() {
  if (!layer) return
  animate(layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'linear' })
  after(150, removeLayer)
}

/** Tear everything down without leaving the reader hidden or a card parked. */
function resetFlight() {
  clearWatchdog()
  clearTimers()
  setClasses([], ['nova-mail-flying', 'nova-mail-open', 'nova-mail-reveal', 'nova-mail-closing'])
  removeLayer()
  if (resizeBound) {
    window.removeEventListener('resize', handleResize)
    resizeBound = false
  }
  flight = null
  closePromise = null
}

/** Give a reader back its own enter animation after a cut-short flight. */
function restoreReader(reader) {
  if (!reader?.isConnected) return
  reader.getAnimations?.().forEach(animation => animation.cancel())
  // `none`, not the default: the pane is already on screen and its enter
  // keyframe would replay from opacity 0 if it were handed back now.
  reader.style.animation = 'none'
  reader.style.transform = ''
  reader.style.width = ''
  reader.style.height = ''
  reader.style.opacity = ''
  reader.style.backgroundColor = ''
  reader.style.overflow = ''
}

/** The flight was cut short: never leave the reader hidden behind it, and drop
 *  the remembered preview so a later close cannot fly back to a void. */
export function abortMailTransition() {
  const reader = flight?.reader
  resetFlight()
  lastSource = null
  restoreReader(reader)
}

function handleResize() {
  // Rects captured before a resize are stale: land immediately instead of
  // flying to a position that no longer exists.
  if (!flight) return
  switch (flight.phase) {
    case 'close':
      finishClose()
      break
    case 'closed':
    case 'handoff':
      removeLayer()
      resetFlight()
      break
    default:
      abortMailTransition()
  }
}

function bindResize() {
  if (resizeBound) return
  window.addEventListener('resize', handleResize)
  resizeBound = true
}

function captureSource(rowEl) {
  const rect = rectOf(rowEl)
  if (!rect) return null

  const source = {
    rect,
    radius: cornerRadius(rowEl),
    // Sample the list surface rather than the row: a hovered or active row
    // paints its own highlight, which is not what the card should carry.
    background: paintedBackground(rowEl.parentElement || rowEl),
    shadow: boxShadow(rowEl),
    row: rowEl.cloneNode(true),
    emailId: rowEl.dataset.emailId || '',
    viewport: { width: window.innerWidth, height: window.innerHeight },
  }

  source.row.removeAttribute('id')
  source.row.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'))

  return source
}

/**
 * Step 1 of the open: called from the list click handler *before* the route
 * changes, so the layer covers the row by the time the list goes away.
 *
 * @returns {boolean} true when the layer took over the click.
 */
export function captureListPreview(rowEl) {
  if (!rowEl || !rowEl.isConnected) return false

  // Repeated clicks: while the card is already growing a second layer would
  // stack on top of it. Before the reader mounts nothing is on screen yet, so a
  // newer row simply replaces the parked snapshot.
  if (flight && flight.phase !== 'pending') return false

  const source = captureSource(rowEl)
  if (!source) return false

  lastSource = source
  closePromise = null

  const reduced = prefersReduced()
  flight = { phase: 'pending', source, emailId: source.emailId, reduced }

  // Reduced motion: no flying card at all, the reader just fades in.
  if (!reduced) buildLayer(source)

  setClasses(['nova-mail-flying', 'nova-mail-open'], ['nova-mail-reveal', 'nova-mail-closing'])
  bindResize()

  // Navigation may never happen (failed push, another guard): never leave the
  // reader hidden or a card parked on screen.
  clearWatchdog()
  watchdog = setTimeout(() => abortMailTransition(), PENDING_TIMEOUT)

  return true
}

/**
 * Step 2 of the open: called once the reader is mounted and measurable.
 */
export function playReaderOpen(readerEl) {
  const pending = flight?.phase === 'pending' ? flight : null

  // Opened from anywhere but a list row (notification, deep link, reload):
  // there is no preview to grow out of, and nothing to fly back to later. A
  // flight already in progress is left alone — the preview it remembers belongs
  // to this very mount.
  if (!pending || !readerEl) {
    if (pending) abortMailTransition()
    else if (!flight) lastSource = null
    return
  }

  clearWatchdog()
  const { source, reduced } = pending
  pending.reader = readerEl

  const target = rectOf(readerEl)
  if (!target) {
    abortMailTransition()
    return
  }

  // This mount is animated by the flight, not by the view's own enter keyframe:
  // the reader and the wrapper around it are pinned so that dropping the flight
  // classes later cannot restart that keyframe mid-reveal.
  readerEl.style.animation = 'none'
  suppressViewEnter()
  pending.phase = 'open'

  if (reduced) {
    setClasses(['nova-mail-reveal'], ['nova-mail-closing'])
    after(REDUCED_FADE + 60, finishOpen)
    return
  }

  const dx = target.left - source.rect.left
  const dy = target.top - source.rect.top

  // The card's SIZE is animated as layout, not as `scale`: a preview row is an
  // order of magnitude shorter than the reading pane, so scaling it would smear
  // the sender/subject beyond recognition. Growing the box keeps the snapshot at
  // its natural size (the row owns a fixed height, so nothing reflows inside it)
  // while only the surface around it grows. The position stays a transform, so
  // the motion itself is still composited.
  animate(surface, [
    {
      width: `${source.rect.width}px`,
      height: `${source.rect.height}px`,
      transform: 'translate3d(0, 0, 0)',
      borderRadius: `${source.radius}px`,
      boxShadow: source.shadow,
      backgroundColor: source.background,
      offset: 0,
    },
    {
      borderRadius: `${Math.max(source.radius, cornerRadius(readerEl), MID_RADIUS)}px`,
      boxShadow: midShadow(),
      offset: .45,
    },
    {
      width: `${target.width}px`,
      height: `${target.height}px`,
      transform: `translate3d(${dx}px, ${dy}px, 0)`,
      borderRadius: `${cornerRadius(readerEl)}px`,
      boxShadow: boxShadow(readerEl),
      backgroundColor: paintedBackground(readerEl),
      offset: 1,
    },
  ], { duration: FLIGHT })

  // The snapshot stays readable while the card grows, then hands over.
  animate(contentHost, [{ opacity: 1 }, { opacity: 0 }], {
    duration: CONTENT_FADE,
    delay: CONTENT_FADE_DELAY,
    easing: 'linear',
  })

  after(REVEAL_DELAY, () => {
    if (flight?.phase === 'open') setClasses(['nova-mail-reveal'], [])
  })
  after(FLIGHT + 40, finishOpen)
}

function finishOpen() {
  if (flight?.phase !== 'open') return
  // `lastSource` deliberately survives: it is where the close flies back to.
  resetFlight()
}

/**
 * The reverse flight. Awaited by the reader's leave guard, so the detail DOM is
 * only unmounted once the card has landed.
 *
 * @returns {Promise<void>} resolved when the visual half of the close is done.
 */
export function playReaderClose(readerEl) {
  if (closePromise) return closePromise

  // An open flight that never finished (the reader was left immediately): there
  // is no reading pane worth reversing, so let the route change run at once.
  if (flight && flight.phase !== 'open') {
    abortMailTransition()
    return Promise.resolve()
  }

  const source = lastSource
  const reduced = prefersReduced()
  const usable = Boolean(source && readerEl && !reduced
      && source.viewport.width === window.innerWidth
      && source.viewport.height === window.innerHeight
      && withinViewport(source.rect)
      && rectOf(readerEl))

  flight = { phase: 'close', reader: readerEl, source, emailId: source?.emailId || '', reduced }
  bindResize()

  if (!usable) {
    closePromise = playFallbackClose(readerEl, reduced)
    return closePromise
  }

  const from = snapshotRect(readerEl.getBoundingClientRect())
  const dx = source.rect.left - from.left
  const dy = source.rect.top - from.top

  buildLayer(source)
  layer.style.opacity = '0'

  readerEl.style.animation = 'none'
  readerEl.style.overflow = 'hidden'

  setClasses(['nova-mail-flying', 'nova-mail-closing'], ['nova-mail-open', 'nova-mail-reveal'])

  // The reverse of the open: the pane collapses back to the preview's box
  // instead of being squashed by a scale. Its width barely changes, so the mail
  // body (a sandboxed iframe) is never re-flowed — it is simply clipped while
  // the parts fade out.
  animate(readerEl, [
    {
      width: `${from.width}px`,
      height: `${from.height}px`,
      transform: 'translate3d(0, 0, 0)',
      borderRadius: `${cornerRadius(readerEl)}px`,
      boxShadow: boxShadow(readerEl),
      backgroundColor: 'rgba(0, 0, 0, 0)',
      offset: 0,
    },
    {
      borderRadius: `${Math.max(source.radius, MID_RADIUS)}px`,
      boxShadow: midShadow(),
      backgroundColor: source.background,
      offset: .45,
    },
    {
      width: `${source.rect.width}px`,
      height: `${source.rect.height}px`,
      transform: `translate3d(${dx}px, ${dy}px, 0)`,
      borderRadius: `${source.radius}px`,
      boxShadow: source.shadow,
      backgroundColor: source.background,
      offset: 1,
    },
  ], { duration: FLIGHT })

  // Cross-fade at the very end, when both surfaces sit exactly on top of each
  // other: the pane fades out while the parked preview fades in.
  animate(readerEl, [{ opacity: 1 }, { opacity: 0 }], {
    duration: 100,
    delay: FLIGHT - 100,
    easing: 'linear',
  })
  animate(layer, [{ opacity: 0 }, { opacity: 1 }], {
    duration: 140,
    delay: FLIGHT - 140,
    easing: 'linear',
  })

  closePromise = new Promise(resolve => {
    flight.resolveClose = resolve
    watchdog = setTimeout(() => finishClose(), FLIGHT + UNMOUNT_TIMEOUT)
    after(FLIGHT, finishClose)
  })

  return closePromise
}

function finishClose() {
  if (flight?.phase !== 'close') return
  const { resolveClose, reader } = flight
  flight.phase = 'closed'
  clearWatchdog()

  // Safety net: if the route change never follows (a cancelled navigation), the
  // parked preview and the faded-out pane must not stay behind.
  setTimeout(() => {
    if (flight?.phase !== 'closed') return
    resetFlight()
    restoreReader(reader)
  }, UNMOUNT_TIMEOUT)

  resolveClose?.()
}

/** No usable preview to fly back to: a short, honest fade (and scale) instead. */
function playFallbackClose(readerEl, reduced) {
  const keyframes = reduced
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.985)' }]

  closePromise = animate(readerEl, keyframes, {
    duration: reduced ? REDUCED_FADE : FALLBACK_FADE,
    easing: 'ease-out',
  }).then(() => {
    if (flight?.phase !== 'close') return
    flight.phase = 'closed'
    // Same safety net as the full flight: if the route change never follows, the
    // pane must not stay faded out.
    setTimeout(() => {
      if (flight?.phase !== 'closed') return
      const reader = flight.reader
      resetFlight()
      restoreReader(reader)
    }, UNMOUNT_TIMEOUT)
  })

  return closePromise
}

/**
 * The list paints itself with `nova-view-in` when it comes back. The parked card
 * has to land on a row that is not still sliding into place, so that enter
 * animation is cancelled in place — inline, because removing the flight class
 * later would otherwise restart it.
 */
function suppressViewEnter() {
  document.querySelectorAll('.main-view, .desktop-mail-workspace').forEach(el => {
    el.style.animation = 'none'
  })
}

/**
 * Called when the reader unmounts, i.e. after the route has changed. Hands the
 * parked preview over to the real list row.
 *
 * The list can be rebuilt from scratch on the way back, so the snapshot waits
 * for the row to reappear, corrects itself if the row landed elsewhere, and only
 * then disappears.
 */
export function readerUnmounted() {
  if (flight?.phase === 'handoff') return

  // No close was animated (or it was abandoned): nothing to hand over.
  if (flight?.phase !== 'closed') {
    abortMailTransition()
    return
  }

  const { emailId, source } = flight
  flight.phase = 'handoff'
  closePromise = null
  // `nova-mail-flying` stays on while the card is parked: it keeps the freshly
  // mounted view wrappers from animating under it.
  setClasses([], ['nova-mail-closing', 'nova-mail-open', 'nova-mail-reveal'])
  suppressViewEnter()

  if (!layer) {
    resetFlight()
    return
  }

  if (!emailId) {
    fadeOutLayer()
    after(200, resetFlight)
    return
  }

  const started = performance.now()
  const selector = `[data-email-id="${CSS.escape(String(emailId))}"]`

  const finish = () => {
    removeLayer()
    resetFlight()
  }

  const settle = () => {
    if (flight?.phase !== 'handoff') return

    const row = document.querySelector(selector)

    if (row) {
      suppressViewEnter()
      const rect = rectOf(row)
      if (rect && layer && !sameRect(rect, source.rect)) {
        // The row came back somewhere else (relayout, rescroll): slide the
        // parked preview onto it before handing over.
        animate(surface, [
          { transform: 'translate3d(0, 0, 0)' },
          { transform: `translate3d(${rect.left - source.rect.left}px, ${rect.top - source.rect.top}px, 0)` },
        ], { duration: HANDOFF_MOVE, easing: 'ease-out' })
        after(HANDOFF_MOVE + 20, finish)
        return
      }
      finish()
      return
    }

    if (performance.now() - started > HANDOFF_TIMEOUT) {
      fadeOutLayer()
      after(200, resetFlight)
      return
    }

    requestAnimationFrame(settle)
  }

  requestAnimationFrame(settle)
}
