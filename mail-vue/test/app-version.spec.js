import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  APP_VERSION_CACHE_DURATION,
  APP_VERSION_CACHE_KEY,
  GITHUB_LATEST_RELEASE_URL,
  createAppVersionSource,
} from '../src/composables/use-app-version.js'

const fallbackVersion = 'v0.0.0-test'

const memoryStorage = () => {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

describe('app version source', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('uses tag_name from a successful GitHub latest-release response', async () => {
    const storage = memoryStorage()
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: 'v1.2.0' }),
    })
    const source = createAppVersionSource({ fallbackVersion, fetchImpl, storage, now: () => 100 })

    await source.load()

    expect(source.version.value).toBe('v1.2.0')
    expect(fetchImpl).toHaveBeenCalledWith(GITHUB_LATEST_RELEASE_URL, expect.any(Object))
  })

  it('uses a fresh cached version without requesting GitHub', async () => {
    const storage = memoryStorage()
    storage.setItem(APP_VERSION_CACHE_KEY, JSON.stringify({
      tagName: 'v1.1.0',
      expiresAt: 100 + APP_VERSION_CACHE_DURATION,
    }))
    const fetchImpl = vi.fn()
    const source = createAppVersionSource({ fallbackVersion, fetchImpl, storage, now: () => 100 })

    await source.load()

    expect(source.version.value).toBe('v1.1.0')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps the build version when GitHub cannot be reached', async () => {
    const source = createAppVersionSource({
      fallbackVersion,
      fetchImpl: vi.fn().mockRejectedValue(new Error('offline')),
      storage: memoryStorage(),
    })

    await source.load()

    expect(source.version.value).toBe(fallbackVersion)
  })

  it('keeps the build version when a release has no tag_name', async () => {
    const source = createAppVersionSource({
      fallbackVersion,
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
      storage: memoryStorage(),
    })

    await source.load()

    expect(source.version.value).toBe(fallbackVersion)
  })

  it('makes About and the sidebar consume the same shared version source', () => {
    const aside = readFileSync(resolve(process.cwd(), 'src/layout/aside/index.vue'), 'utf8')
    const about = readFileSync(resolve(process.cwd(), 'src/views/setting/index.vue'), 'utf8')

    expect(aside).toContain("useAppVersion} from '@/composables/use-app-version.js'")
    expect(about).toContain("useAppVersion} from '@/composables/use-app-version.js'")
    expect(aside).not.toContain('packageInfo')
    expect(about).not.toContain('packageInfo')
  })
})
