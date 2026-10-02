import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'

// Register only the languages the mail reader supports. Importing highlight.js
// core rather than its all-languages entry keeps the reader bundle contained.
const LANGUAGES = { bash, cpp, csharp, css, go, java, javascript, json, python, rust, sql, typescript, xml }
Object.entries(LANGUAGES).forEach(([name, language]) => hljs.registerLanguage(name, language))

const LANGUAGE_ALIASES = {
  js: 'javascript', jsx: 'javascript', node: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash',
  html: 'xml', xhtml: 'xml', svg: 'xml',
  c: 'cpp', 'c++': 'cpp', cc: 'cpp', hpp: 'cpp',
  cs: 'csharp', 'c#': 'csharp',
  rs: 'rust', golang: 'go',
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function normalizeCodeLanguage(language) {
  const value = String(language || '').trim().toLowerCase().replace(/^language-/, '').replace(/^lang-/, '')
  if (LANGUAGES[value]) return value
  return LANGUAGE_ALIASES[value] || ''
}

/** Conservative per-line evidence. A colon or parenthesis alone is never enough. */
function codeLineScore(line) {
  const value = String(line || '')
  const trimmed = value.trim()
  if (!trimmed) return 0

  let score = 0
  if (/^(?:from\s+[\w.]+\s+import\s+|import\s+[\w.*]+|package\s+[\w.]+|using\s+[\w.]+|#include\s*[<"])/.test(trimmed)) score += 3
  if (/^(?:(?:public|private|protected|internal|static|final|abstract)\s+)*(?:class|interface|enum|record)\s+\w+|^(?:def|fn|func)\s+\w+\s*\(/.test(trimmed)) score += 3
  if (/^(?:const|let|var)\s+\w+|^(?:if|for|while|switch|catch)\s*(?:\(|\[|\w)|^(?:elif|else|try|except|finally)\b/.test(trimmed)) score += 2
  if (/^(?:return|break|continue|pass|throw)\b|^(?:print|console\.log|System\.out\.println|fmt\.Print(?:ln|f)?|println!)\s*\(/.test(trimmed)) score += 2
  if (/^(?:#!|echo\b|export\s+\w+=|(?:fi|then|done)\b|\w+=\$?[^\s]+)/.test(trimmed)) score += 2
  if (/^\s{2,}\S/.test(value)) score += 1
  if (/^(?:\/\/|\/\*|\*\/|#(?!\s*(?:\w+\s*:|\w+$)))/.test(trimmed)) score += 1
  if (/\b(?:=>|===|!==|==|!=|\+=|-=|&&|\|\|)\b|[{};]/.test(trimmed)) score += 1
  if (/^[\w.$\[\]]+\s*=\s*[^=]/.test(trimmed)) score += 1
  if (/\)\s*[:{]$|:\s*$/.test(trimmed) && /\b(?:if|for|while|def|class|else|try|catch)\b/.test(trimmed)) score += 1
  return score
}

/**
 * Split a plain-text message into prose and high-confidence code runs.
 * A run needs three code-like lines (or two very strong ones), so ordinary
 * English/Chinese sentences and a single parenthesised sentence stay prose.
 */
export function detectCodeBlocks(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    if (codeLineScore(lines[index]) < 2) {
      blocks.push({ type: 'text', text: lines[index] })
      index++
      continue
    }

    const start = index
    let end = index
    let featureLines = 0
    let strongLines = 0
    let score = 0
    let blanks = 0

    while (end < lines.length) {
      const lineScore = codeLineScore(lines[end])
      if (!lines[end].trim()) {
        blanks++
        if (blanks > 2) break
        end++
        continue
      }
      if (lineScore === 0) break
      blanks = 0
      featureLines++
      if (lineScore >= 3) strongLines++
      score += lineScore
      end++
    }

    while (end > start && !lines[end - 1].trim()) end--
    const code = lines.slice(start, end).join('\n')
    const confident = (featureLines >= 3 && score >= 7) || (strongLines >= 2 && featureLines >= 2 && score >= 6)

    if (confident) blocks.push({ type: 'code', code, language: detectLanguage(code) })
    else blocks.push({ type: 'text', text: lines.slice(start, end).join('\n') })
    index = Math.max(end, start + 1)
  }

  // Join adjacent prose pieces back together for a small, predictable output.
  return blocks.reduce((result, block) => {
    const previous = result.at(-1)
    if (block.type === 'text' && previous?.type === 'text') previous.text += `\n${block.text}`
    else result.push(block)
    return result
  }, [])
}

/** Guess only when there is a distinctive signal; otherwise preserve plaintext. */
export function detectLanguage(code) {
  const source = String(code || '')
  if (!source.trim()) return ''
  try { JSON.parse(source); return 'json' } catch { /* not JSON */ }
  if (/^\s*<!doctype\s+html|<\/?[a-z][^>]*>/im.test(source)) return 'xml'
  if (/^\s*(?:SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE)\b/im.test(source)) return 'sql'
  if (/^\s*#include\s*[<"]|\bstd::|\bint\s+main\s*\(/m.test(source)) return 'cpp'
  if (/^\s*(?:package\s+main|func\s+\w+\s*\(|fmt\.)/m.test(source)) return 'go'
  if (/^\s*(?:fn\s+\w+|let\s+mut\b|println!\s*\()/m.test(source)) return 'rust'
  if (/^\s*(?:using\s+\w|namespace\s+\w|Console\.)/m.test(source)) return 'csharp'
  if (/^\s*(?:package\s+[\w.]+|public\s+(?:static\s+)?class|System\.out\.)/m.test(source)) return 'java'
  if (/^\s*(?:#!.*\b(?:ba)?sh|echo\b|export\s+\w+=|(?:if|for|while)\s+\[|fi$|done$)/m.test(source)) return 'bash'
  if (/^\s*(?:def\s+\w+\s*\(|from\s+[\w.]+\s+import\s+|import\s+[\w.]+|print\s*\(|class\s+\w+.*:)/m.test(source)) return 'python'
  if (/^\s*(?:interface\s+\w+|type\s+\w+\s*=|enum\s+\w+|(?:const|let)\s+\w+\s*:\s*\w+)/m.test(source)) return 'typescript'
  if (/^\s*(?:const|let|var)\s+\w+|=>|console\./m.test(source)) return 'javascript'
  if (/^\s*[.#]?[\w-]+\s*\{[\s\S]*:[\s\S]*\}/m.test(source)) return 'css'
  return ''
}

export function renderCodeBlock(code, language = '') {
  const source = String(code || '')
  const normalized = normalizeCodeLanguage(language) || detectLanguage(source)
  const html = normalized
    ? hljs.highlight(source, { language: normalized, ignoreIllegals: true }).value
    : escapeHtml(source)
  const languageClass = normalized ? ` language-${normalized}` : ''
  const lineCount = source ? source.split('\n').length : 0
  const lineLabel = `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`
  return `<div class="nova-code-block"><div class="nova-code-toolbar"><span class="nova-code-lines">${lineLabel}</span><button class="nova-code-copy" type="button" data-nova-copy-code="1" aria-label="Copy code">Copy</button></div><pre><code class="hljs${languageClass}">${html}</code></pre></div>`
}

function languageFromCodeElement(code) {
  const classes = Array.from(code.classList || [])
  return classes.map(normalizeCodeLanguage).find(Boolean) || code.getAttribute('data-language') || ''
}

/** Enhance already-sanitized HTML. Output is sanitized again by the caller. */
export function enhanceCodeBlocks(html) {
  if (typeof DOMParser === 'undefined') return String(html || '')
  const doc = new DOMParser().parseFromString(`<div data-nova-code-root="1">${String(html || '')}</div>`, 'text/html')
  const root = doc.body.querySelector('[data-nova-code-root]')
  if (!root) return String(html || '')

  root.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code') || pre
    pre.outerHTML = renderCodeBlock(code.textContent || '', languageFromCodeElement(code))
  })
  root.querySelectorAll('code').forEach((code) => {
    if (code.closest('pre, .nova-code-block')) return
    code.outerHTML = renderCodeBlock(code.textContent || '', languageFromCodeElement(code))
  })
  return root.innerHTML
}

function isPlainHtmlTextBlock(node) {
  return Array.from(node.childNodes || []).every((child) => (
    child.nodeType === 3 || (child.nodeType === 1 && child.tagName === 'BR')
  ))
}

function textFromHtmlBlock(node) {
  return Array.from(node.childNodes || []).map((child) => {
    if (child.nodeType === 3) return child.nodeValue || ''
    return child.nodeType === 1 && child.tagName === 'BR' ? '\n' : ''
  }).join('')
}

function detectedBlocksFragment(doc, blocks) {
  const fragment = doc.createDocumentFragment()
  blocks.forEach((block) => {
    if (block.type === 'code') {
      const holder = doc.createElement('div')
      holder.innerHTML = renderCodeBlock(block.code, block.language)
      fragment.append(holder.firstChild)
      return
    }
    const prose = doc.createElement('div')
    prose.className = 'nova-code-prose'
    prose.textContent = block.text
    fragment.append(prose)
  })
  return fragment
}

/**
 * HTML-only mail clients commonly serialize a pasted code snippet as adjacent
 * `<div>`s and `<br>`s rather than `<pre>`. Group those text-only siblings and
 * run the same conservative detector, while leaving formatted mail and quoted
 * reply containers untouched.
 */
export function enhanceHtmlTextCodeBlocks(html) {
  if (typeof DOMParser === 'undefined') return String(html || '')
  const doc = new DOMParser().parseFromString(`<div data-nova-code-root="1">${String(html || '')}</div>`, 'text/html')
  const root = doc.body.querySelector('[data-nova-code-root]')
  if (!root) return String(html || '')

  const skipped = 'blockquote, .nova-quoted, .quote-block, .quote-content, details'
  const visit = (container) => {
    if (container.matches?.(skipped)) return

    const children = Array.from(container.children)
    for (let index = 0; index < children.length;) {
      const first = children[index]
      if (!isPlainHtmlTextBlock(first)) {
        visit(first)
        index++
        continue
      }

      const group = []
      while (index < children.length && isPlainHtmlTextBlock(children[index])) {
        group.push(children[index])
        index++
      }
      const blocks = detectCodeBlocks(group.map(textFromHtmlBlock).join('\n'))
      if (!blocks.some(block => block.type === 'code')) continue

      group[0].replaceWith(detectedBlocksFragment(doc, blocks))
      group.slice(1).forEach(node => node.remove())
    }
  }

  visit(root)
  return root.innerHTML
}

/** Add detected code only to the new plain-text body; quoted reply markup stays untouched. */
export function enhancePlainTextCodeBlocks(html) {
  if (typeof DOMParser === 'undefined') return String(html || '')
  const doc = new DOMParser().parseFromString(`<div data-nova-code-root="1">${String(html || '')}</div>`, 'text/html')
  const root = doc.body.querySelector('[data-nova-code-root]')
  if (!root) return String(html || '')

  root.querySelectorAll('.quote-plain').forEach((node) => {
    const blocks = detectCodeBlocks(node.textContent || '')
    if (!blocks.some(block => block.type === 'code')) return
    node.replaceWith(detectedBlocksFragment(doc, blocks))
  })
  return root.innerHTML
}
