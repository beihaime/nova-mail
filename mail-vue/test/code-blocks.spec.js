import { describe, expect, it } from 'vitest'
import {
  detectCodeBlocks,
  detectLanguage,
  enhancePlainTextCodeBlocks,
  renderCodeBlock,
} from '../src/utils/code-blocks.js'
import { prepareMailBody, prepareMarkdownBody } from '../src/utils/mail-html.js'
import { quotedTextToHtml } from '../src/utils/quoted-text.js'

function firstCode(text) {
  return detectCodeBlocks(text).find(block => block.type === 'code')
}

describe('plain-text code detection', () => {
  it('detects the Python loop example as one highlighted block', () => {
    const code = firstCode(`import time

target = 700_000_000
start = time.perf_counter()

for i in range(1_000_000_000):
    if i == target:
        break

end = time.perf_counter()
print(f"found: {i}")
print(f"spent: {(end - start) * 1000:.3f} ms")`)

    expect(code?.language).toBe('python')
    expect(code?.code).toContain('for i in range')
  })

  it('recognises Java, JavaScript, and shell from distinctive syntax', () => {
    expect(firstCode('package demo;\npublic class App {\n  public static void main(String[] args) {\n    System.out.println("hi");\n  }\n}')?.language).toBe('java')
    expect(firstCode('const total = 3;\nconst add = (a, b) => a + b;\nconsole.log(add(total, 2));')?.language).toBe('javascript')
    expect(firstCode('#!/usr/bin/env bash\nexport NAME=Nova\necho "$NAME"\nif [ -n "$NAME" ]; then\n  echo ok\nfi')?.language).toBe('bash')
  })

  it('does not mistake C includes for HTML and labels C separately from C++', () => {
    const cSource = '#include <stdio.h>\nint main(void) {\n  printf("Hello\\n");\n  return 0;\n}'
    expect(firstCode(cSource)?.language).toBe('c')
    expect(renderCodeBlock(cSource)).toContain('>C</span>')
    expect(detectLanguage('#include <vector>\nint main() { std::vector<int> values; }')).toBe('cpp')
  })

  it('keeps a raw HTML document together as one HTML code block', () => {
    const source = `<!doctype html>
<html lang="zh-CN">
<head>
  <style>
    body { color: #18181b; }
  </style>
</head>
<body><main>Hello</main></body>
</html>`

    const blocks = detectCodeBlocks(source)
    expect(blocks).toEqual([{ type: 'code', code: source, language: 'xml' }])

    const html = enhancePlainTextCodeBlocks(quotedTextToHtml(source, 'Quoted'))
    expect(html.match(/nova-code-block/g)).toHaveLength(1)
    expect(html).toContain('language-xml')
    expect(html).toContain('data-nova-code-source="<!doctype html>')
    expect(html).toContain('hljs-meta')
    expect(html).toContain('body { color: #18181b; }')
  })

  it('does not mistake ordinary English, Chinese, or one parenthesised sentence for code', () => {
    expect(firstCode('Hello team,\n\nCould you review the plan tomorrow?\n\nThanks!')).toBeUndefined()
    expect(firstCode('你好，\n\n明天我们讨论一下发布计划。\n\n谢谢！')).toBeUndefined()
    expect(firstCode('Please call me when you arrive (the office is on the third floor).')).toBeUndefined()
  })

  it('only replaces the new plain-text body, never the quoted reply', () => {
    const html = enhancePlainTextCodeBlocks(quotedTextToHtml('const x = 1;\nconsole.log(x);\nreturn x;\n\n> const old = 2;\n> console.log(old);', 'Quoted'))
    expect(html).toContain('nova-code-block')
    expect(html).toContain('const old = 2;')
    expect(html.match(/nova-code-block/g)).toHaveLength(1)
  })
})

describe('explicit code blocks', () => {
  it('honours a fenced Markdown language and highlights it', () => {
    const html = prepareMarkdownBody('```python\nimport time\nprint(time.time())\n```').html
    expect(html).toContain('nova-code-block')
    expect(html).toContain('language-python')
    expect(html).toContain('hljs-keyword')
  })

  it('enhances sanitized HTML pre/code content without trusting its attributes', () => {
    const html = prepareMailBody({ html: '<pre><code class="language-json" onclick="alert(1)">{"ok": true}</code></pre>' }).html
    expect(html).toContain('nova-code-block')
    expect(html).toContain('language-json')
    expect(html).toContain('hljs-attr')
    expect(html).not.toContain('onclick')
  })

  it('detects code pasted as div/br HTML, as produced by common mail clients', () => {
    const html = prepareMailBody({
      html: '<div><div>package com.example;</div><div>import java.util.List;</div><div>public class Rules {<br>&nbsp;&nbsp;private boolean valid(int move) {<br>&nbsp;&nbsp;&nbsp;&nbsp;if (move == 0) {<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;return false;<br>&nbsp;&nbsp;&nbsp;&nbsp;}<br>&nbsp;&nbsp;&nbsp;&nbsp;return true;<br>&nbsp;&nbsp;}</div></div>',
    }).html

    expect(html).toContain('nova-code-block')
    expect(html).toContain('language-java')
    expect(html).toContain('hljs-keyword')
  })

  it('falls back to plaintext when language confidence is low', () => {
    expect(detectLanguage('just some opaque tokens\nwith no useful syntax')).toBe('')
    expect(renderCodeBlock('opaque syntax').replace(/<[^>]+>/g, '')).toContain('opaque syntax')
  })

  it('renders a copy affordance and an accurate code line count', () => {
    const html = renderCodeBlock('const a = 1;\nconsole.log(a);', 'javascript')
    expect(html).toContain('<div class="nova-code-toolbar">')
    expect(html).toContain('<div class="nova-code-scroll"><div class="nova-code-content">')
    expect(html).toContain('data-nova-copy-code="1"')
    expect(html).toContain('2 lines')
    expect(html).toContain('JavaScript')
    expect(html).toContain('data-line="1"')
    expect(html).toContain('data-line="2"')
    expect(html).toContain('class="nova-code-line-number"')
    expect(html).toContain('class="nova-code-line-content"')
    expect(html).toContain('data-nova-code-source="const a = 1;\nconsole.log(a);"')
  })

  it('keeps the header outside the horizontally scrollable source layer', () => {
    const source = `public class VeryLongLine { ${'String value = "Nova Mail"; '.repeat(20)} }`
    const html = renderCodeBlock(source, 'java')

    expect(html.indexOf('nova-code-toolbar')).toBeLessThan(html.indexOf('nova-code-scroll'))
    expect(html).toContain('>Java</span>')
    expect(html).toContain('data-nova-copy-code="1"')
    expect(html).toContain('data-line="1"')
  })

  it('keeps a large plaintext block in one independently scrollable source layer', () => {
    const source = Array.from({ length: 220 }, (_, index) => `unclassified_token_${index} = ${'x'.repeat(80)}`).join('\n')
    const html = renderCodeBlock(source)

    expect(html.match(/nova-code-toolbar/g)).toHaveLength(1)
    expect(html.match(/nova-code-scroll/g)).toHaveLength(1)
    expect(html).toContain('Plain text')
    expect(html).toContain('220 lines')
    expect(html).toContain('data-line="220"')
  })
})
