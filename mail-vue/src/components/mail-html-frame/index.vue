<template>
  <div ref="wrapper" class="mail-frame" :class="{ 'is-measured': measured }">
    <iframe
      ref="frame"
      class="mail-frame__iframe"
      :sandbox="sandbox"
      :title="title || t('bodyFrameTitle')"
      :style="frameStyle"
      :scrolling="measured ? 'no' : 'auto'"
      referrerpolicy="no-referrer"
      @load="handleFrameLoad"
    ></iframe>
  </div>
</template>

<script setup>
/**
 * Sandboxed mail body renderer.
 *
 * The HTML body of a mail is untrusted input. It is sanitized and then rendered
 * inside its own document (`srcdoc`) in an `<iframe sandbox>` — never into this
 * component's DOM, never through `v-html`. The frame therefore cannot reach the
 * Vue tree, the stores, cookies or LocalStorage, and its CSP forbids network
 * access beyond (opt-in) images.
 *
 * Height is reported automatically: the frame either measures itself and posts
 * the value (scripts mode) or the parent reads it from the frame document
 * (default mode). See `utils/mail-frame.js` for the trade-off.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  MAIL_FRAME_HEIGHT_MESSAGE,
  MAIL_FRAME_MEASURE_BY_PARENT,
  MAIL_FRAME_MIN_HEIGHT,
  MAIL_FRAME_SCRIPTS,
  MAIL_FRAME_SANDBOX,
  buildMailFrameDocument,
  createFrameNonce,
  readFrameContentHeight,
} from '@/utils/mail-frame.js'

const props = defineProps({
  // Raw mail HTML. Markdown is rendered by the reader instead, not here.
  html: {
    type: String,
    default: ''
  },
  // Plain-text alternative. Shown inside the frame when the markup has nothing
  // renderable left (a mail whose HTML the sanitizer removed entirely).
  text: {
    type: String,
    default: ''
  },
  // Reader allowed remote images for this message.
  allowImages: {
    type: Boolean,
    default: false
  },
  theme: {
    type: String,
    default: 'light',
    validator: value => ['light', 'dark'].includes(value)
  },
  title: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['blocked', 'loaded'])

const { t } = useI18n()

const frame = ref(null)
const wrapper = ref(null)
const measured = ref(false)
const frameHeight = ref(0)

const sandbox = MAIL_FRAME_SANDBOX
const nonce = MAIL_FRAME_SCRIPTS ? createFrameNonce() : ''

/**
 * A frame that measures below this had no layout yet, not an empty message.
 *
 * On a phone the body is created by the tap that opens the card, so the frame
 * document can be parsed and loaded before that card has been laid out. Accepting
 * that first, near-zero height collapsed the message to a sliver — and with
 * `scrolling="no"` the content was then unreachable. Keeping the previous height
 * (or the fixed fallback) means the worst case is a scrollable pane, never a
 * blank one.
 */
const MIN_MEASURED_HEIGHT = MAIL_FRAME_MIN_HEIGHT

let frameObserver = null
let wrapperObserver = null
let timers = []
// The mail itself had no renderable markup (set by rebuild, read by the report).
// When the document was last written, and whether a reload has been tried. The
// frame's very first `load` (about:blank) can arrive before the document is in
// place, so an empty frame is only acted on after a grace period.
let writtenAt = 0
let reloadAttempted = false

const frameStyle = computed(() => (
  measured.value ? { height: `${frameHeight.value}px` } : {}
))

function releaseFrame() {
  frameObserver?.disconnect()
  frameObserver = null
  timers.forEach(clearTimeout)
  timers = []
}

/** Read the rendered height straight out of the (same-origin) frame document. */
function measureFrame() {
  if (!MAIL_FRAME_MEASURE_BY_PARENT) return

  const element = frame.value
  if (!element) return

  let doc = null
  try {
    doc = element.contentDocument
  } catch {
    doc = null
  }

  // `readFrameContentHeight` also refuses a reading taken at a degenerate width:
  // while the host is still zero-wide every line wraps per character and the mail
  // measures hundreds of pixels tall (see the helper's contract).
  const height = readFrameContentHeight(doc, element.clientWidth)

  if (height < MIN_MEASURED_HEIGHT) return

  const next = Math.ceil(height)
  if (next !== frameHeight.value) frameHeight.value = next
  measured.value = true
}

/**
 * Put the built document into the frame.
 *
 * Written straight into the frame's own document rather than through `srcdoc`.
 * `srcdoc` has to navigate the frame, and on some phones that navigation never
 * lands: the attribute held 8957 characters while the frame document stayed empty,
 * so the message rendered as a blank box. Writing is synchronous and cannot be
 * lost; `srcdoc` remains the fallback for an engine that does not expose the
 * frame document at all.
 */
function applyDocument(markup) {
  const element = frame.value
  if (!element) return

  let written = false
  try {
    const doc = element.contentDocument
    if (doc) {
      doc.open()
      doc.write(markup)
      doc.close()
      written = true
    }
  } catch {
    written = false
  }

  if (!written) element.srcdoc = markup

  writtenAt = Date.now()

  observeFrame()
}

/**
 * Did the document actually land?
 *
 * `srcdoc` navigations can be lost and a write can fail on an engine that does not
 * hand over the frame document; when that happens the frame is empty, so the
 * document is applied again once. The reader never has to change renderers.
 */
function ensureFrameLoaded() {
  if (frameHasDocument() || !props.html) return
  if (reloadAttempted || Date.now() - writtenAt <= EMPTY_GRACE_MS) return

  reloadAttempted = true
  rebuild()
}

/** Does the frame hold our document (the body wrapper is the marker)? */
function frameHasDocument() {
  try {
    return Boolean(frame.value?.contentDocument?.querySelector?.('[data-nova-mail-body]'))
  } catch {
    return false
  }
}

/** How long a frame may take to hold its document before it counts as failed. */
const EMPTY_GRACE_MS = 800

function observeFrame() {
  releaseFrame()
  measureFrame()

  if (!MAIL_FRAME_MEASURE_BY_PARENT) return

  const element = frame.value

  let doc = null
  try {
    doc = element?.contentDocument
  } catch {
    doc = null
  }

  if (!doc?.documentElement) return

  if (typeof ResizeObserver !== 'undefined') {
    frameObserver = new ResizeObserver(() => measureFrame())
    frameObserver.observe(doc.documentElement)
    if (doc.body) frameObserver.observe(doc.body)
  }

  // Images and webfonts land after `load`; re-measure a few times as a cheap
  // safety net for browsers without ResizeObserver.
  ;[60, 180, 400, 900, 1600].forEach(delay => {
    timers.push(setTimeout(() => { measureFrame(); ensureFrameLoaded() }, delay))
  })

  doc.fonts?.ready?.then?.(() => measureFrame()).catch?.(() => {})

  doc.querySelectorAll?.('img').forEach(image => {
    if (image.complete) return
    image.addEventListener('load', measureFrame, { once: true })
    image.addEventListener('error', measureFrame, { once: true })
  })
}

/**
 * Watch the host box, not just the document inside it.
 *
 * The frame document only reflows once the host has a width, and on a phone the
 * host is the card that is still opening when the frame loads — so a document
 * observer alone can miss the layout that finally gives the mail its size.
 * Rotation, a keyboard opening and the desktop split pane resizing all land here
 * too. `measureFrame` only writes when the value actually changed, so this
 * cannot ping-pong with its own resize.
 */
function observeWrapper() {
  if (typeof ResizeObserver === 'undefined' || !wrapper.value) return

  wrapperObserver?.disconnect()
  wrapperObserver = new ResizeObserver(() => measureFrame())
  wrapperObserver.observe(wrapper.value)
}

function handleFrameLoad() {
  observeFrame()
  ensureFrameLoaded()
  emit('loaded')
}

/** Height reports from inside the frame, validated against *this* frame window. */
function handleMessage(event) {
  if (!frame.value || event.source !== frame.value.contentWindow) return

  const payload = event.data
  if (!payload || payload.type !== MAIL_FRAME_HEIGHT_MESSAGE) return

  const height = Number(payload.height)
  if (!Number.isFinite(height) || height <= 0) return

  frameHeight.value = Math.ceil(height)
  measured.value = true
}

function rebuild() {
  if (!props.html) {
    try { frame.value?.contentDocument?.open?.(); frame.value?.contentDocument?.close?.() } catch { /* frame gone */ }
    measured.value = false
    frameHeight.value = 0
    emit('blocked', 0)
    return
  }

  // A re-render reloads the frame, so the old observers must not survive it.
  releaseFrame()
  measured.value = false
  frameHeight.value = 0

  const built = buildMailFrameDocument({
    html: props.html,
    allowImages: props.allowImages,
    theme: props.theme === 'dark' ? 'dark' : 'light',
    nonce,
    title: props.title,
    fallbackText: props.text
  })

  reloadAttempted = false

  applyDocument(built.document)
  emit('blocked', built.blocked)
}

onMounted(() => {
  window.addEventListener('message', handleMessage)
  window.addEventListener('resize', measureFrame)
  window.addEventListener('orientationchange', measureFrame)
  observeWrapper()
  rebuild()
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handleMessage)
  window.removeEventListener('resize', measureFrame)
  window.removeEventListener('orientationchange', measureFrame)
  wrapperObserver?.disconnect()
  wrapperObserver = null
  releaseFrame()
})

watch(
  () => [props.html, props.allowImages, props.theme],
  () => rebuild()
)

/**
 * Re-measure on demand.
 *
 * The reader calls this right after a card is expanded: on a phone the frame is
 * created by that tap, so the earliest readings are taken while the card is still
 * opening and the layout that matters only exists a frame later.
 */
defineExpose({
  remeasure() {
    observeWrapper()
    measureFrame()
  }
})
</script>

<style scoped>
.mail-frame {
  width: 100%;
  display: block;
}

.mail-frame__iframe {
  width: 100%;
  display: block;
  border: 0;
  /* The frame is an opaque pane: give it no background of its own so the mail's
     own colours (and the app's theme behind it) show through. */
  background: transparent;
  color-scheme: normal;
}

/* Before the first successful measurement the frame stands at a small, scrollable
   height — never a large one. A frame that cannot be measured must not be allowed
   to push the rest of the conversation off screen; the height is replaced by the
   mail's real height as soon as it can be read. */
.mail-frame:not(.is-measured) .mail-frame__iframe {
  height: 150px;
  overflow: auto;
}
</style>
