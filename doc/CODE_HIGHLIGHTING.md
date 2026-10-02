# Code blocks and syntax highlighting

[简体中文](CODE_HIGHLIGHTING.zh-CN.md)

Nova Mail turns code embedded in email into a readable, copyable code block
without changing the stored message body. The reader supports explicit code
markup first, then applies conservative heuristics only when a message was sent
as plain text or as text-only HTML.

![Java code highlighting in Nova Mail](demo/JavaPreview.png)

## What readers see

Every detected code block has:

- JetBrains Mono when it is available, with a monospace fallback;
- language-aware syntax highlighting and a language label;
- compact, stable line numbers;
- horizontal scrolling on small screens, so indentation is never rewritten;
- a Copy control that copies the original source, not rendered HTML;
- theme-aware light and dark colours.

The reader does not leave a code block half rendered or expose action drawers.
Code remains part of the email body and can be selected normally.

## Detection order

1. **Markdown fenced blocks** such as <code>```python</code> use the supplied
   language directly.
2. **HTML `<pre>` and `<code>` blocks** are always rendered as code. Existing
   mail HTML is sanitized before and after enhancement.
3. **Raw HTML source sent as text** (for example a complete `<!doctype html>`
   document) becomes one `HTML` code block. It is not split so that CSS inside
   `<style>` is incorrectly presented as a separate code block.
4. **Plain text and text-only HTML** are scanned line by line. Adjacent lines
   produced by mail clients as `<div>` / `<br>` are considered together.

Heuristics require either at least three code-like lines with enough combined
evidence, or two especially strong lines. Signals include imports, declarations,
control flow, assignments, braces, comments, significant indentation and common
command forms. A sentence that merely has a colon, parentheses or an angle
bracket is not enough.

## Language detection

When a fenced block declares a language, that declaration wins. Otherwise Nova
only assigns a language after finding distinctive syntax. If confidence is low,
the content remains a safe `Plain text` code block.

| Language shown in reader | Typical signals |
| --- | --- |
| Python | `import`, `from … import`, `def`, `class`, `for … in` |
| Java | `package`, `public class`, `System.out` |
| JavaScript / TypeScript | `const`, `let`, `=>`, interfaces or type declarations |
| C | `#include <stdio.h>`, `printf`, `int main` |
| C++ | `std::`, `namespace`, templates, `<vector>` / `<iostream>` |
| C# | `using`, `namespace`, `Console.` |
| Go | `package main`, `func`, `fmt.` |
| Rust | `fn`, `let mut`, `println!` |
| Shell | shebangs, `export`, `echo`, `fi`, `done` |
| JSON | valid JSON |
| HTML | document starts and structural HTML tags |
| CSS | selector/property structure |
| SQL | `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE` |

An include such as `#include <stdio.h>` is specifically treated as C source,
not HTML. Java and C# are tested before C++ so a Java `public class` block is
not claimed by the more general C++ `class` signal.

## Examples

### Plain-text Python

```text
import time

target = 700_000_000
for i in range(1_000_000_000):
    if i == target:
        break

print(f"found: {i}")
```

This becomes one Python block even without Markdown fences.

### Raw HTML source

```html
<!doctype html>
<html lang="en">
  <head><style>body { color: #18181b; }</style></head>
  <body><main>Hello</main></body>
</html>
```

The entire document is one HTML block. This rule applies to source sent as text;
an actual `text/html` email is still sanitized and rendered as email content.

### C and C++

```c
#include <stdio.h>

int main(void) {
  printf("Hello, Nova Mail!\n");
  return 0;
}
```

```cpp
#include <vector>

int main() {
  std::vector<int> values{1, 2, 3};
}
```

## Security and privacy

Code enhancement never bypasses the mail HTML sanitizer. HTML emails are
sanitized before code recognition, generated highlight markup is sanitized a
second time, and only Nova-created Copy controls are allowed through. The copied
value is kept as escaped source data; no code is executed, and email-provided
classes, styles, scripts or event handlers are never trusted.

For ordinary HTML mail, remote images remain blocked until the reader explicitly
allows them. Highlighting does not alter quoted replies, signatures or
attachments.

## Validation

The frontend tests cover explicit Markdown and HTML blocks, Python, Java,
JavaScript, Shell, C/C++, raw HTML source, ordinary English and Chinese prose,
and short parenthesized sentences. Run them with:

```bash
pnpm --filter mail-vue run test
pnpm --filter mail-vue run build
```
