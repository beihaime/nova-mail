import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Only the two requests this suite drives are needed. Everything else in the
// module is stubbed so no axios/session-state import cycle runs.
const mocks = vi.hoisted(() => ({
  accountList: vi.fn(),
  accountSetDefaultSender: vi.fn(),
}))

vi.mock('@/request/account.js', () => ({
  accountList: (...args) => mocks.accountList(...args),
  accountAdd: vi.fn(),
  accountDelete: vi.fn(),
  accountSetAllReceive: vi.fn(),
  accountSetAsTop: vi.fn(),
  accountSetDefaultSender: (...args) => mocks.accountSetDefaultSender(...args),
  accountSetName: vi.fn(),
}))

vi.mock('@/utils/time-utils.js', () => ({ sleep: () => Promise.resolve() }))

import { resetAccountAddresses, useAccountAddresses } from '../src/composables/use-account-addresses.js'
import { adoptAuthenticatedUser, clearAuthenticatedSession } from '../src/utils/session-state.js'
import { useUserStore } from '../src/store/user.js'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

// The composable is written for the browser bundle, where `ElMessage` is
// auto-imported. Supply the global the feedback path calls.
globalThis.ElMessage = vi.fn()

const identity = (userId, email, extra = {}) => ({
  userId,
  email,
  name: email.split('@')[0],
  permKeys: ['account:query', 'email:send'],
  account: { accountId: userId, email },
  defaultSender: null,
  ...extra,
})

const row = (accountId, email, extra = {}) => ({
  accountId, email, name: email.split('@')[0], sort: 0, allReceive: 0, canSend: true, ...extra,
})

async function signIn(userId, email, rows, extra) {
  mocks.accountList.mockResolvedValue(rows)
  adoptAuthenticatedUser(identity(userId, email, extra))
  const addresses = useAccountAddresses()
  await flush()
  return addresses
}

describe('default sender settings action', () => {
  beforeAll(() => {
    setActivePinia(createPinia())
  })

  beforeEach(() => {
    resetAccountAddresses()
    mocks.accountList.mockReset()
    mocks.accountSetDefaultSender.mockReset()
    clearAuthenticatedSession()
  })

  it('offers the action only where the server says sending is allowed', async () => {
    const addresses = await signIn(1, 'a@example.com', [
      row(11, 'a@example.com'),
      row(12, 'a-alias@example.com'),
      row(13, 'blocked@example.com', { canSend: false }),
    ], { defaultSender: { accountId: 12, email: 'a-alias@example.com' } })

    expect(addresses.isDefaultSender({ accountId: 12 })).toBe(true)
    expect(addresses.isDefaultSender({ accountId: 11 })).toBe(false)

    // The effective default never offers to become the default again...
    expect(addresses.canSetDefaultSender({ accountId: 12, canSend: true })).toBe(false)
    // ...the primary and other usable addresses do...
    expect(addresses.canSetDefaultSender({ accountId: 11, canSend: true })).toBe(true)
    // ...and an address the server marked unsendable does not.
    expect(addresses.canSetDefaultSender({ accountId: 13, canSend: false })).toBe(false)
  })

  it('renders the server-confirmed selection after a successful change', async () => {
    const addresses = await signIn(2, 'b@example.com', [
      row(21, 'b@example.com'),
      row(22, 'b-alias@example.com'),
    ])

    // Legacy fallback: the primary is the effective default and is the only row
    // without the action.
    expect(addresses.defaultSenderAccountId.value).toBeNull()
    expect(addresses.canSetDefaultSender({ accountId: 22, canSend: true })).toBe(true)

    mocks.accountSetDefaultSender.mockResolvedValue({
      configuredAccountId: 22,
      effectiveSender: { accountId: 22, email: 'b-alias@example.com', name: 'b-alias', canSend: true },
    })

    addresses.setDefaultSender({ accountId: 22, email: 'b-alias@example.com' })
    await flush()

    expect(mocks.accountSetDefaultSender).toHaveBeenCalledWith(22)
    const store = useUserStore()
    expect(store.user.defaultSender.email).toBe('b-alias@example.com')
    expect(store.user.defaultSenderAccountId).toBe(22)
    // The confirmed state drives the row rendering immediately.
    expect(addresses.isDefaultSender({ accountId: 22 })).toBe(true)
    expect(addresses.canSetDefaultSender({ accountId: 22, canSend: true })).toBe(false)
  })

  it('never applies an optimistic change when the server rejects it', async () => {
    const addresses = await signIn(3, 'c@example.com', [
      row(31, 'c@example.com'),
      row(32, 'c-alias@example.com'),
    ])
    const store = useUserStore()
    const refresh = vi.spyOn(store, 'refreshUserInfo').mockResolvedValue()
    const before = store.user.defaultSender

    mocks.accountSetDefaultSender.mockRejectedValue(new Error('not allowed'))

    addresses.setDefaultSender({ accountId: 32, email: 'c-alias@example.com' })
    await flush()

    // The failed mutation must leave the UI exactly as the server last reported
    // it, and re-read the authoritative identity.
    expect(store.user.defaultSender).toBe(before)
    expect(addresses.isDefaultSender({ accountId: 32 })).toBe(false)
    expect(refresh).toHaveBeenCalled()
    expect(addresses.defaultSenderSaving.value).toBe(false)
  })
})
