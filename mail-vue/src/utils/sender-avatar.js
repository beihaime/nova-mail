import http from '@/axios/index.js'

/**
 * Sender-avatar resolution (client side).
 *
 * The server owns the provider chain (local → BIMI → Gravatar → domain →
 * initial) and returns one `SenderAvatar`; this module only:
 *
 *  - normalises that shape (so a component never inspects `source` to decide
 *    how to render),
 *  - serves the inline `message.avatar` the list API already attached,
 *  - lazily asks `GET /api/avatar` for a row the list marked `pending`, and
 *  - dedupes those requests per address so a re-render (or two rows from the
 *    same sender) never triggers a second lookup.
 *
 * @typedef {Object} SenderAvatar
 * @property {string|null} url
 * @property {'local'|'bimi'|'gravatar'|'domain'|'initial'} source
 * @property {boolean} verified
 * @property {string} [initials]
 * @property {boolean} [pending] server only ran its cheap path
 */

export const AVATAR_SOURCE = Object.freeze({
  LOCAL: 'local',
  BIMI: 'bimi',
  GRAVATAR: 'gravatar',
  DOMAIN: 'domain',
  INITIAL: 'initial',
})

const SOURCES = new Set(Object.values(AVATAR_SOURCE))

/** In-flight/resolved metadata per address; cleared on logout by the caller. */
const metadataCache = new Map()

/** First character of the display name, then the mailbox; `?` as last resort. */
export function initialsForSender(name, email) {
  const source = String(name || '').trim() || String(email || '').trim()
  return source.charAt(0).toUpperCase() || '?'
}

/**
 * Make a server-provided avatar URL loadable by `<img>`.
 *
 * The server returns `/api/avatar/image?id=…`; in the default release build the
 * SPA shares that origin, but `.env.dev` / `.env.remote` point the API at
 * another host, so the path is resolved against the API's origin.
 */
export function absoluteSenderAvatarUrl(url) {
  const value = String(url || '')
  if (!value) return ''
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value
  }
  const base = String(import.meta.env?.VITE_BASE_URL || '')
  const origin = globalThis.location?.origin
  if (!origin) return value
  try {
    return `${new URL(base || '/', origin).origin}${value.startsWith('/') ? value : `/${value}`}`
  } catch {
    return value
  }
}

/** Normalise any server-provided avatar object into the SenderAvatar shape. */
export function normalizeSenderAvatar(raw) {
  if (!raw || typeof raw !== 'object') {
    return { url: null, source: AVATAR_SOURCE.INITIAL, verified: false }
  }
  return {
    url: typeof raw.url === 'string' && raw.url ? absoluteSenderAvatarUrl(raw.url) : null,
    source: SOURCES.has(raw.source) ? raw.source : AVATAR_SOURCE.INITIAL,
    verified: raw.verified === true,
    ...(typeof raw.initials === 'string' && raw.initials ? { initials: raw.initials } : {}),
    ...(raw.pending ? { pending: true } : {}),
  }
}

/** Sender address of a list row (`sendEmail`) or a thread message (`from.email`). */
export function senderAddress(message) {
  const value = message?.sendEmail ?? message?.from?.email ?? message?.email ?? ''
  return String(value || '').trim()
}

/** Display name of a list row or a thread message. */
export function senderName(message) {
  const value = message?.name ?? message?.from?.name ?? ''
  return String(value || '').trim()
}

/** Row id used to give the server the message's BIMI selector + auth results. */
export function senderEmailId(message) {
  return Number(message?.emailId ?? message?.id) || 0
}

/** The avatar the list API already attached, if any. */
export function inlineSenderAvatar(message) {
  const inline = message?.avatar
  if (!inline || typeof inline !== 'object') return null
  const normalized = normalizeSenderAvatar(inline)
  return normalized.pending ? { ...normalized, pending: true } : normalized
}

function cacheKey(email, emailId) {
  return `${String(email || '').trim().toLowerCase()}|${Number(emailId) || 0}`
}

/**
 * Ask the server to finish resolving one address.
 *
 * `exclude` skips sources whose image just failed to load, so the next level of
 * the chain is returned (`bimi` → `gravatar` → `domain` → `initial`).
 */
export function fetchSenderAvatar({ email, emailId = 0, exclude = [] } = {}) {
  const params = { email }
  if (Number(emailId) > 0) params.emailId = Number(emailId)
  const excluded = Array.isArray(exclude) ? exclude.filter(Boolean) : []
  if (excluded.length) params.exclude = excluded.join(',')

  return http
    .get('/avatar', { params, noMsg: true })
    .then(normalizeSenderAvatar)
    .catch(() => ({ url: null, source: AVATAR_SOURCE.INITIAL, verified: false }))
}

/**
 * Resolve the avatar for one sender.
 *
 * The plain lookup is cached (and de-duplicated) per address; an `exclude`
 * lookup is a one-off fallback request and is never cached, so a later render
 * still starts from the best source.
 */
export function resolveSenderAvatar({ email, emailId = 0, exclude = [] } = {}) {
  const excluded = Array.isArray(exclude) ? exclude.filter(Boolean) : []
  if (excluded.length) return fetchSenderAvatar({ email, emailId, exclude: excluded })

  const key = cacheKey(email, emailId)
  if (!metadataCache.has(key)) {
    metadataCache.set(key, fetchSenderAvatar({ email, emailId }))
  }
  return metadataCache.get(key)
}

/** Drop one address (or every address) from the client-side cache. */
export function invalidateSenderAvatar(email, emailId = 0) {
  if (email === undefined) metadataCache.clear()
  else metadataCache.delete(cacheKey(email, emailId))
}
