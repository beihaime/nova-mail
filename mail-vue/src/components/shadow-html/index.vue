<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import DOMPurify from 'dompurify'
import { useUiStore } from '@/store/ui.js'

const props = defineProps({
  html: {
    type: String,
    required: true
  }
})

const container = ref(null)
const contentBox = ref(null)
const uiStore = useUiStore()
let shadowRoot = null

const allowedStyleProperties = new Set([
  'background', 'background-color', 'border', 'border-bottom', 'border-collapse',
  'border-color', 'border-radius', 'border-spacing', 'border-style', 'border-width',
  'color', 'display', 'font-family', 'font-size', 'font-style', 'font-weight',
  'height', 'line-height', 'margin', 'margin-bottom', 'margin-left', 'margin-right',
  'margin-top', 'max-height', 'max-width', 'min-height', 'min-width', 'padding',
  'padding-bottom', 'padding-left', 'padding-right', 'padding-top', 'text-align',
  'text-decoration', 'vertical-align', 'white-space', 'width', 'word-break', 'word-wrap'
])

function parseCssColor(value) {
  const normalized = String(value || '').trim().toLowerCase()

  // Do not flatten designed backgrounds such as gradients.
  if (!normalized || /gradient\s*\(/i.test(normalized)) return null

  const tokenMatch = normalized.match(
    /#[0-9a-f]{3,6}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b/i
  )

  if (!tokenMatch) return null

  const token = tokenMatch[0].toLowerCase()

  if (token === 'white') return { r: 255, g: 255, b: 255, a: 1 }
  if (token === 'black') return { r: 0, g: 0, b: 0, a: 1 }

  if (token.startsWith('#')) {
    const hex = token.slice(1)

    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1
      }
    }

    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1
      }
    }

    return null
  }

  const rgb = token.match(/^rgba?\(([^)]+)\)$/i)
  if (!rgb) return null

  const parts = rgb[1]
    .replace(/\//g, ' ')
    .split(/[,\s]+/)
    .filter(Boolean)

  if (parts.length < 3) return null

  const channel = (part) => {
    if (part.endsWith('%')) {
      return Math.round(Math.max(0, Math.min(100, parseFloat(part))) * 2.55)
    }

    return Math.max(0, Math.min(255, parseFloat(part)))
  }

  const r = channel(parts[0])
  const g = channel(parts[1])
  const b = channel(parts[2])
  const a = parts[3] == null
    ? 1
    : Math.max(0, Math.min(1, parseFloat(parts[3])))

  if ([r, g, b, a].some(Number.isNaN)) return null

  return { r, g, b, a }
}

function colorLuma(color) {
  return (
    color.r * 0.2126 +
    color.g * 0.7152 +
    color.b * 0.0722
  )
}

function normalizeDarkStyleValue(property, value) {
  if (!uiStore.dark) return value

  const color = parseCssColor(value)
  if (!color || color.a < .5) return value

  const luma = colorLuma(color)

  if (
    (property === 'background' || property === 'background-color') &&
    luma >= 235
  ) {
    return 'transparent'
  }

  if (property === 'color' && luma <= 90) {
    return '#D1D1D6'
  }

  return value
}

function sanitizeInlineStyle(style) {
  return style.split(';').map((declaration) => {
    const separator = declaration.indexOf(':')
    if (separator === -1) return ''

    const property = declaration.slice(0, separator).trim().toLowerCase()
    const value = declaration.slice(separator + 1).trim()
    const unsafeValue = /(?:expression\s*\(|url\s*\(|@import|javascript:|behavior\s*:|-moz-binding)/i.test(value)

    if (!allowedStyleProperties.has(property) || unsafeValue) return ''

    const safeValue = normalizeDarkStyleValue(property, value)
    return `${property}: ${safeValue}`
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
        color: ${uiStore.dark ? '#D1D1D6' : '#13181D'};
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

  if (childWidth === 0) return

  const scale = parentWidth / childWidth

  const hostElement = shadowRoot.host
  hostElement.style.zoom = scale
}

onMounted(() => {
  shadowRoot = container.value.attachShadow({ mode: 'open' })
  updateContent()
  autoScale()
})

watch(() => [props.html, uiStore.dark], () => {
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
