import { beforeEach, describe, expect, it, vi } from 'vitest'

// The resolver only needs the HTTP client; mocking it keeps these tests free of
// router, Pinia and Element Plus side effects.
const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/axios/index.js', () => ({ default: { get: mocks.get } }))

import {
  AVATAR_SOURCE,
  absoluteSenderAvatarUrl,
  fetchSenderAvatar,
  initialsForSender,
  inlineSenderAvatar,
  invalidateSenderAvatar,
  normalizeSenderAvatar,
  resolveSenderAvatar,
  senderAddress,
  senderEmailId,
  senderName,
} from '@/utils/sender-avatar.js'

const origin = 'http://localhost:3000'

beforeEach(() => {
  vi.clearAllMocks()
  invalidateSenderAvatar()
})

describe('sender identity helpers', () => {
  it('reads both list rows and thread messages', () => {
    const row = { sendEmail: 'github@example.com', name: 'GitHub', emailId: 4 }
    expect(senderAddress(row)).toBe('github@example.com')
    expect(senderName(row)).toBe('GitHub')
    expect(senderEmailId(row)).toBe(4)

    const message = { from: { email: 'chatgpt@example.com', name: 'ChatGPT' }, emailId: 9 }
    expect(senderAddress(message)).toBe('chatgpt@example.com')
    expect(senderName(message)).toBe('ChatGPT')
    expect(senderEmailId(message)).toBe(9)
  })

  it('derives the initial from the name, then the mailbox, then "?"', () => {
    expect(initialsForSender('GitHub', 'x@example.com')).toBe('G')
    expect(initialsForSender('', 'chatgpt@example.com')).toBe('C')
    expect(initialsForSender('', '')).toBe('?')
  })
})

describe('avatar normalisation', () => {
  it('resolves the API-relative image path against the API origin', () => {
    expect(absoluteSenderAvatarUrl('/api/avatar/image?id=abc')).toBe(`${origin}/api/avatar/image?id=abc`)
    expect(absoluteSenderAvatarUrl('https://cdn.example.com/logo.svg')).toBe('https://cdn.example.com/logo.svg')
    expect(absoluteSenderAvatarUrl('')).toBe('')
  })

  it('coerces an unknown or malformed server shape to the initial avatar', () => {
    expect(normalizeSenderAvatar(null)).toEqual({
      url: null,
      source: AVATAR_SOURCE.INITIAL,
      verified: false,
    })
    expect(normalizeSenderAvatar({ url: '/api/avatar/image?id=1', source: 'wat', verified: 'yes' })).toEqual({
      url: `${origin}/api/avatar/image?id=1`,
      source: AVATAR_SOURCE.INITIAL,
      verified: false,
    })
  })

  it('carries the pending flag so the component knows to ask the server', () => {
    expect(inlineSenderAvatar({ avatar: { url: null, source: 'initial', verified: false, pending: true } }))
      .toMatchObject({ pending: true })
    expect(inlineSenderAvatar({ avatar: { url: null, source: 'initial', verified: false } }))
      .not.toHaveProperty('pending')
    expect(inlineSenderAvatar({})).toBeNull()
  })
})

describe('resolution requests', () => {
  it('de-duplicates lookups for the same address', async () => {
    mocks.get.mockResolvedValue({ url: '/api/avatar/image?id=1', source: 'gravatar', verified: false })

    const first = await resolveSenderAvatar({ email: 'User@Example.com', emailId: 5 })
    const second = await resolveSenderAvatar({ email: 'user@example.com', emailId: 5 })

    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.get).toHaveBeenCalledWith('/avatar', {
      params: { email: 'User@Example.com', emailId: 5 },
      noMsg: true,
    })
    expect(first.source).toBe('gravatar')
    expect(second.url).toBe(`${origin}/api/avatar/image?id=1`)
  })

  it('sends the exclude list when walking down the fallback chain', async () => {
    mocks.get.mockResolvedValue({ url: null, source: 'initial', verified: false })

    await fetchSenderAvatar({ email: 'user@example.com', emailId: 7, exclude: ['bimi', 'gravatar'] })

    expect(mocks.get).toHaveBeenCalledWith('/avatar', {
      params: { email: 'user@example.com', emailId: 7, exclude: 'bimi,gravatar' },
      noMsg: true,
    })
  })

  it('falls back to the initial avatar when the request fails', async () => {
    mocks.get.mockRejectedValue(new Error('network'))

    const avatar = await fetchSenderAvatar({ email: 'user@example.com' })
    expect(avatar).toEqual({ url: null, source: AVATAR_SOURCE.INITIAL, verified: false })
  })

  it('keeps an unverified BIMI result unverified', async () => {
    mocks.get.mockResolvedValue({ url: '/api/avatar/image?id=2', source: 'bimi', verified: false, initials: 'B' })

    const avatar = await resolveSenderAvatar({ email: 'brand@example.com' })
    expect(avatar).toMatchObject({ source: 'bimi', verified: false, initials: 'B' })
  })
})
