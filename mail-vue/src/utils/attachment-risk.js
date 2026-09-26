/**
 * Attachment risk assessment.
 *
 * An attachment is attacker-controlled content: the filename comes from the
 * mail and the bytes come from the sender. Nova Mail never executes anything,
 * but a user who downloads `invoice.pdf.exe` and opens it does, so the reader
 * warns before handing over a file that the operating system would treat as
 * active content.
 *
 * The check is extension based (and looks through double extensions, e.g.
 * `report.pdf.exe`), because that is what decides how a file is opened on the
 * user's machine — a declared MIME type is only a hint and is spoofable.
 */

/** Extensions the OS or browser will run / render as active content. */
const DANGEROUS_EXTENSIONS = new Set([
  // native executables and launchers
  'exe', 'com', 'scr', 'pif', 'cpl', 'msi', 'msp', 'mst', 'app', 'dmg', 'pkg',
  'deb', 'rpm', 'run', 'apk', 'ipa', 'gadget', 'lnk', 'url', 'scf', 'inf',
  'reg', 'chm', 'hlp', 'jnlp', 'xll',
  // script hosts
  'bat', 'cmd', 'btm', 'nt', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'ws',
  'ps1', 'ps1xml', 'psm1', 'psd1', 'psc1', 'sh', 'bash', 'zsh', 'ksh', 'csh',
  'py', 'pyw', 'rb', 'pl', 'pm', 'php', 'lua', 'ahk', 'jar', 'class',
  // active web / document content the browser renders locally
  'html', 'htm', 'xhtml', 'shtml', 'svg', 'xml', 'xsl', 'xslt', 'mht',
  'mhtml', 'hta', 'swf',
  // macro-enabled office documents
  'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'sldm',
])

/**
 * Extensions that look harmless in front of a real extension: the classic
 * `invoice.pdf.exe` trick. Kept as a list so the warning can say why.
 */
const DECOY_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png',
  'gif', 'txt', 'csv', 'zip', 'rar', '7z', 'mp3', 'mp4', 'rtf', 'odt',
])

/** @param {string} value */
function extensionsOf(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[\\/]/)
    .pop()
    .split('.')
    .slice(1)
    .filter(Boolean)
    .map(part => part.replace(/[^a-z0-9]/g, ''))
}

/**
 * How risky is this attachment?
 *
 * @param {{filename?: string, mimeType?: string}} attachment
 * @returns {{risky: boolean, extension: string, decoy: string, reason: 'executable'|'active-content'|'macro'|'double-extension'|null}}
 */
export function attachmentRisk(attachment) {
  const extensions = extensionsOf(attachment?.filename)
  const extension = extensions[extensions.length - 1] || ''

  if (!extension || !DANGEROUS_EXTENSIONS.has(extension)) {
    return { risky: false, extension, decoy: '', reason: null }
  }

  // `invoice.pdf.exe`: a decoy in front of the real extension.
  const decoy = extensions.length > 1 && DECOY_EXTENSIONS.has(extensions[extensions.length - 2])
    ? extensions[extensions.length - 2]
    : ''

  if (decoy) return { risky: true, extension, decoy, reason: 'double-extension' }
  if (['html', 'htm', 'xhtml', 'shtml', 'svg', 'xml', 'xsl', 'xslt', 'mht', 'mhtml', 'hta', 'swf'].includes(extension)) {
    return { risky: true, extension, decoy, reason: 'active-content' }
  }
  if (['docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'sldm'].includes(extension)) {
    return { risky: true, extension, decoy, reason: 'macro' }
  }

  return { risky: true, extension, decoy, reason: 'executable' }
}

/** Convenience wrapper for templates. */
export function isRiskyAttachment(attachment) {
  return attachmentRisk(attachment).risky
}

export default { attachmentRisk, isRiskyAttachment }
