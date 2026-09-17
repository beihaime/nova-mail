import { toOssDomain } from '@/utils/convert.js'

function attachmentKey(src, storageDomain) {
  const prefixes = ['{{domain}}', '/', '', '/api/oss/']
  const origin = toOssDomain(storageDomain)
  if (origin) prefixes.push(origin + '/')
  for (const prefix of prefixes) {
    if (src.startsWith(prefix + 'attachments/')) {
      const key = src.slice(prefix.length)
      return /^attachments\/[A-Za-z0-9._/-]+$/.test(key) ? key : null
    }
  }
  return null
}

export async function fetchPrivateAttachment(key, imageOnly = true) {
  if (!/^attachments\/[A-Za-z0-9._/-]+$/.test(key)) throw new Error('Invalid attachment key')
  const response = await fetch(`${import.meta.env.VITE_BASE_URL}/oss/${key}`, {
    headers: { Authorization: localStorage.getItem('token') || '' },
    cache: 'no-store'
  })
  if (!response.ok || (imageOnly && !response.headers.get('content-type')?.startsWith('image/'))) {
    throw new Error('Attachment unavailable')
  }
  return response.blob()
}

export async function resolvePrivateMailImages(html, storageDomain) {
  // Only inspect img src attributes as text. Parsing untrusted mail into a DOM
  // before sanitization could itself initiate remote image requests.
  const source = html || ''
  const imageSrc = /(<img\b[^>]*?\bsrc\s*=\s*)(["'])(.*?)\2/gi
  const keys = [...new Set([...source.matchAll(imageSrc)]
    .map(match => attachmentKey(match[3], storageDomain)).filter(Boolean))]
  const replacements = new Map(await Promise.all(keys.map(async (key) => {
    try {
      const blob = await fetchPrivateAttachment(key)
      const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
      })
      return [key, dataUrl]
    } catch {
      return [key, '']
    }
  })))
  return source.replace(imageSrc, (full, prefix, quote, src) => {
    const key = attachmentKey(src, storageDomain)
    return key ? `${prefix}${quote}${replacements.get(key) || ''}${quote}` : full
  })
}
