import { describe, it, expect } from 'vitest'
import { attachmentRisk, isRiskyAttachment } from '../src/utils/attachment-risk.js'

describe('attachmentRisk', () => {
  it('accepts ordinary documents, images and archives', () => {
    for (const filename of [
      'report.pdf',
      'notes.txt',
      'photo.JPG',
      'sheet.xlsx',
      'slides.pptx',
      'archive.zip',
      'data.csv',
      'no-extension',
      '',
    ]) {
      expect(isRiskyAttachment({ filename }), filename).toBe(false)
    }
  })

  it('flags native executables', () => {
    for (const filename of ['setup.exe', 'installer.MSI', 'run.bat', 'tool.apk', 'shortcut.lnk', 'macro.jar']) {
      const risk = attachmentRisk({ filename })
      expect(risk.risky, filename).toBe(true)
      expect(risk.reason, filename).toBe('executable')
    }
  })

  it('flags script hosts', () => {
    for (const filename of ['payload.vbs', 'x.ps1', 'y.sh', 'z.php', 'w.py', 'a.js']) {
      expect(isRiskyAttachment({ filename }), filename).toBe(true)
    }
  })

  it('flags active web content separately', () => {
    for (const filename of ['page.html', 'vector.svg', 'feed.xml', 'doc.mhtml']) {
      const risk = attachmentRisk({ filename })
      expect(risk.risky, filename).toBe(true)
      expect(risk.reason, filename).toBe('active-content')
    }
  })

  it('flags macro-enabled office documents separately', () => {
    for (const filename of ['invoice.docm', 'book.xlsm', 'deck.pptm']) {
      const risk = attachmentRisk({ filename })
      expect(risk.risky, filename).toBe(true)
      expect(risk.reason, filename).toBe('macro')
    }
  })

  it('sees through a double extension', () => {
    const risk = attachmentRisk({ filename: 'invoice.pdf.exe' })

    expect(risk.risky).toBe(true)
    expect(risk.reason).toBe('double-extension')
    expect(risk.extension).toBe('exe')
    expect(risk.decoy).toBe('pdf')
  })

  it('does not call an ordinary double extension a decoy', () => {
    const risk = attachmentRisk({ filename: 'archive.tar.exe' })

    expect(risk.risky).toBe(true)
    expect(risk.decoy).toBe('')
  })

  it('ignores directory components and trailing whitespace tricks', () => {
    expect(attachmentRisk({ filename: '../../tmp/report.pdf' }).risky).toBe(false)
    expect(attachmentRisk({ filename: 'notes.txt ' }).risky).toBe(false)
  })

  it('is not fooled by an uppercase or unusual spelling', () => {
    expect(attachmentRisk({ filename: 'INVOICE.PDF.EXE' }).reason).toBe('double-extension')
    expect(attachmentRisk({ filename: 'x.EXE' }).reason).toBe('executable')
  })

  it('tolerates a missing attachment', () => {
    expect(attachmentRisk(null).risky).toBe(false)
    expect(attachmentRisk(undefined).risky).toBe(false)
    expect(attachmentRisk({}).risky).toBe(false)
  })

  it('does not treat a declared mime type as a reason to trust the file', () => {
    // The bytes are attacker-controlled and the declaration is only a hint.
    expect(attachmentRisk({ filename: 'evil.exe', mimeType: 'application/pdf' }).risky).toBe(true)
  })
})
