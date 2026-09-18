<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import DOMPurify from 'dompurify'

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const container = ref(null)
const contentBox = ref(null)
let shadowRoot = null
let resizeObserver = null
let observedWidth = 0

/** Re-scale when the host box gets a real size (e.g. a collapsed card expands). */
function handleResize() {
  const width = contentBox.value?.offsetWidth || 0
  if (width === observedWidth) return
  observedWidth = width
  autoScale()
}

const allowedStyleProperties = new Set([
  'background', 'background-color', 'border', 'border-bottom', 'border-collapse',
  'border-color', 'border-radius', 'border-spacing', 'border-style', 'border-width',
  'color', 'display', 'font-family', 'font-size', 'font-style', 'font-weight',
  'height', 'line-height', 'margin', 'margin-bottom', 'margin-left', 'margin-right',
  'margin-top', 'max-height', 'max-width', 'min-height', 'min-width', 'padding',
  'padding-bottom', 'padding-left', 'padding-right', 'padding-top', 'text-align',
  'text-decoration', 'vertical-align', 'white-space', 'width', 'word-break', 'word-wrap'
])

function sanitizeInlineStyle(style) {
  return style.split(';').map((declaration) => {
    const separator = declaration.indexOf(':')
    if (separator === -1) return ''

    const property = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim()
    const unsafeValue = /(?:expression\s*\(|url\s*\(|@import|javascript:|behavior\s*:|-moz-binding)/i.test(value)

    return allowedStyleProperties.has(property) && !unsafeValue ? `${property}: ${value}` : ''
  }).filter(Boolean).join('; ')
}

function sanitizeEmailHtml(html) {
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'style') {
      data.attrValue = sanitizeInlineStyle(data.attrValue)
      data.keepAttr = Boolean(data.attrValue)
    }
  })

  try {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['base', 'embed', 'form', 'iframe', 'link', 'math', 'meta', 'object', 'script', 'style', 'svg'],
      FORBID_ATTR: ['srcset']
    })
  } finally {
    DOMPurify.removeAllHooks()
  }
}

function updateContent() {
  if (!shadowRoot) return;

  const cleanedHtml = sanitizeEmailHtml(props.html)

  shadowRoot.innerHTML = `
    <style>
      :host {
        all: initial;
        width: 100%;
        height: 100%;
        font-family: Inter, 'Helvetica Neue', Helvetica, 'PingFang SC',
                    'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: var(--el-text-color-primary, #13181D);
        word-break: break-word;
      }

      h1, h2, h3, h4 {
          font-size: 18px;
          font-weight: 700;
      }

      p {
        margin: 0;
      }

      a {
        text-decoration: none;
        color: #0E70DF;
      }

      .shadow-content {
        background: transparent;
        color: inherit;
        width: fit-content;
        height: fit-content;
        min-width: 100%;
      }

      img:not(table img) {
        max-width: 100%;
        height: auto !important;
      }

      /* Gmail-style quoted-reply hierarchy.
         Every quote level owns its own line; because each nested level is also
         a blockquote (or .quote-block), the indent accumulates by itself and the
         line always spans the full height of that level's content. */
      blockquote,
      .nova-quoted,
      .quote-block {
        margin: 6px 0 0 8px;
        padding: 0 0 0 12px;
        border-left: 2px solid var(--nova-quote-line, #c7cdd4);
      }

      /* Keep the first line flush with the top of the line (no collapsed gap). */
      blockquote > :first-child,
      .nova-quoted > :first-child,
      .quote-block > :first-child {
        margin-top: 0;
      }

      /* Quoted history collapsed by default: "... show quoted content",
         click to expand (native <details>, Gmail style). The wrapper is added
         by utils/quoted-text.js before the HTML reaches this shadow root. */
      details.quote-toggle {
        margin-top: 10px;
      }

      details.quote-toggle > summary.quote-toggle-summary {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 0;
        color: var(--regular-text-color, #5f6368);
        font-size: 13px;
        cursor: pointer;
        list-style: none;
        user-select: none;
      }

      details.quote-toggle > summary.quote-toggle-summary::-webkit-details-marker {
        display: none;
      }

      details.quote-toggle > summary.quote-toggle-summary::marker {
        content: '';
      }

      details.quote-toggle > summary.quote-toggle-summary:hover {
        color: var(--el-color-primary, #0E70DF);
      }

      details.quote-toggle[open] > summary.quote-toggle-summary {
        margin-bottom: 6px;
      }

      details.quote-toggle > .quote-content {
        display: block;
      }

      @media (max-width: 767px) {
        blockquote,
        .nova-quoted,
        .quote-block {
          margin-left: 4px;
          padding-left: 8px;
        }
      }

    </style>
    <div class="shadow-content">
      ${cleanedHtml}
    </div>
  `;
}

function autoScale() {
  if (!shadowRoot || !contentBox.value) return

  const parent = contentBox.value
  const shadowContent = shadowRoot.querySelector('.shadow-content')

  if (!shadowContent) return

  const parentWidth = parent.offsetWidth
  const childWidth = shadowContent.scrollWidth

  // Never scale to 0 / NaN: a not-yet-laid-out host would otherwise hide the
  // whole message (zoom: 0).
  if (childWidth === 0 || parentWidth === 0) return

  const scale = parentWidth / childWidth

  const hostElement = shadowRoot.host
  hostElement.style.zoom = scale
}

onMounted(() => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  updateContent()
  autoScale()

  // A message can mount while collapsed (display:none), where offsetWidth is 0
  // and autoScale bails out. Re-scale once it actually gets laid out, e.g. when
  // a thread message is expanded.
  observedWidth = contentBox.value?.offsetWidth || 0
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(contentBox.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch(() => props.html, () => {
  updateContent()
  autoScale()
})
</script>

<style scoped>
.content-box {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: Inter, "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", Arial, sans-serif;
}

.content-html {
  width: 100%;
  height: 100%;
}
</style>
