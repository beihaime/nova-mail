<template>
  <div class="content-box" ref="contentBox">
    <div ref="container" class="content-html"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
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
        color: #13181D;
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
        background: #FFFFFF;
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
