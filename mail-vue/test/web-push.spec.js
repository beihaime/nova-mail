import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({
  config: null,
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('@/request/push.js', () => ({
  pushConfig: vi.fn(() => request.config),
  pushSubscribe: request.subscribe,
  pushUnsubscribe: request.unsubscribe,
  pushTest: vi.fn(),
}))

import { pushState, syncPushSubscription } from '@/utils/webPush.js'

function key(byte) {
  const bytes = new Uint8Array(65).fill(byte)
  let value = ''
  for (const item of bytes) value += String.fromCharCode(item)
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function subscription(endpoint, serverKey) {
  const padding = '='.repeat((4 - (serverKey.length % 4)) % 4)
  const binary = atob(serverKey.replace(/-/g, '+').replace(/_/g, '/') + padding)
  return {
    endpoint,
    options: { applicationServerKey: Uint8Array.from(binary, c => c.charCodeAt(0)).buffer },
    toJSON: () => ({ keys: { p256dh: 'p256dh', auth: 'auth' } }),
    unsubscribe: vi.fn(async () => true),
  }
}

beforeEach(() => {
  request.config = Promise.resolve({ enabled: true, publicKey: key(1) })
  request.subscribe.mockReset()
  request.unsubscribe.mockReset()
  window.PushManager = class PushManager {}
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted' } })
})

afterEach(() => {
  delete window.PushManager
  delete navigator.serviceWorker
})

describe('web push recovery', () => {
  it('repairs a missing subscription when permission is already granted', async () => {
    const created = subscription('https://push.example/new', key(1))
    const pushManager = {
      getSubscription: vi.fn(async () => null),
      subscribe: vi.fn(async () => created),
    }
    const registration = { pushManager }
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(registration) } })

    await expect(pushState()).resolves.toMatchObject({ available: true, subscribed: true })
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }))
    expect(request.subscribe).toHaveBeenCalled()
  })

  it('replaces a subscription created with an old VAPID key', async () => {
    const old = subscription('https://push.example/old', key(2))
    const created = subscription('https://push.example/new', key(1))
    const pushManager = {
      getSubscription: vi.fn()
        .mockResolvedValueOnce(old)
        .mockResolvedValueOnce(old),
      subscribe: vi.fn(async () => created),
    }
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ pushManager }) } })

    await expect(syncPushSubscription()).resolves.toBe(true)
    expect(request.unsubscribe).toHaveBeenCalledWith(old.endpoint)
    expect(old.unsubscribe).toHaveBeenCalled()
    expect(request.subscribe).toHaveBeenCalledWith(expect.objectContaining({ endpoint: created.endpoint }))
  })
})
