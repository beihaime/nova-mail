import { ref } from 'vue'
import packageInfo from '../../package.json'

export const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/beihaime/nova-mail/releases/latest'
export const APP_VERSION_CACHE_KEY = 'nova-mail:latest-release-version'
export const APP_VERSION_CACHE_DURATION = 6 * 60 * 60 * 1000

const packageVersion = packageInfo.version
  ? `v${String(packageInfo.version).replace(/^v/i, '')}`
  : ''

const storageFor = () => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const readCachedVersion = (storage, now) => {
  if (!storage) return null

  try {
    const cached = JSON.parse(storage.getItem(APP_VERSION_CACHE_KEY) || 'null')
    if (typeof cached?.tagName !== 'string' || !cached.tagName) return null
    return { tagName: cached.tagName, fresh: Number(cached.expiresAt) > now }
  } catch {
    return null
  }
}

const cacheVersion = (storage, tagName, now) => {
  if (!storage) return

  try {
    storage.setItem(APP_VERSION_CACHE_KEY, JSON.stringify({
      tagName,
      expiresAt: now + APP_VERSION_CACHE_DURATION,
    }))
  } catch {
    // Private browsing and quota failures should not affect the displayed version.
  }
}

/**
 * Creates the single release-version source used by every version display.
 * The factory is exported so the caching and failure paths can be tested without
 * coupling tests to browser globals.
 */
export function createAppVersionSource({
  fallbackVersion = packageVersion,
  fetchImpl = (...args) => fetch(...args),
  storage = storageFor(),
  now = () => Date.now(),
} = {}) {
  const version = ref(fallbackVersion)
  const isLoading = ref(false)
  let request = null

  const load = () => {
    const cached = readCachedVersion(storage, now())
    if (cached) {
      version.value = cached.tagName
      if (cached.fresh) return Promise.resolve(version.value)
    }

    if (request) return request

    isLoading.value = true
    request = Promise.resolve()
      .then(() => fetchImpl(GITHUB_LATEST_RELEASE_URL, {
        headers: { Accept: 'application/vnd.github+json' },
      }))
      .then(async (response) => {
        if (!response?.ok) throw new Error('Unable to load the latest release')
        const release = await response.json()
        // tag_name is displayed as GitHub returned it; only an empty/missing value
        // is rejected so the regular build version remains a safe fallback.
        if (typeof release?.tag_name !== 'string' || !release.tag_name) {
          throw new Error('Latest release has no tag name')
        }
        version.value = release.tag_name
        cacheVersion(storage, release.tag_name, now())
        return version.value
      })
      .catch(() => version.value)
      .finally(() => {
        isLoading.value = false
        request = null
      })

    return request
  }

  return { version, isLoading, load }
}

const appVersionSource = createAppVersionSource()

export function useAppVersion() {
  // Intentionally fire-and-forget: displays render immediately with the build
  // version (or a cached release) and update in place when GitHub responds.
  appVersionSource.load()
  return appVersionSource
}
