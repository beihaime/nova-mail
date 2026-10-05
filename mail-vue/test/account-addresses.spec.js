import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// `accountList` is the only request the composable issues while it loads. Mock
// the whole request module so no axios/session-state import cycle runs and so
// the test controls exactly which addresses the server returns per identity.
const mocks = vi.hoisted(() => ({ accountList: vi.fn() }))

vi.mock('@/request/account.js', () => ({
  accountList: (...args) => mocks.accountList(...args),
  accountAdd: vi.fn(),
  accountDelete: vi.fn(),
  accountSetAllReceive: vi.fn(),
  accountSetAsTop: vi.fn(),
  accountSetName: vi.fn(),
}))

vi.mock('@/utils/time-utils.js', () => ({ sleep: () => Promise.resolve() }))

import { resetAccountAddresses, useAccountAddresses } from '../src/composables/use-account-addresses.js'
import { adoptAuthenticatedUser, clearAuthenticatedSession } from '../src/utils/session-state.js'
import { useAccountStore } from '../src/store/account.js'
import { useUserStore } from '../src/store/user.js'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

const identity = (userId, email, permKeys = ['account:query']) => ({
  userId,
  email,
  permKeys,
  account: { accountId: userId, email },
})

const row = (accountId, email) => ({ accountId, email, name: email.split('@')[0], sort: 0, allReceive: 0 })

// Always install the response before the identity changes, because the shared
// composable watches the identity and refetches as soon as it changes.
async function signIn(userId, email, rows) {
  mocks.accountList.mockResolvedValue(rows)
  adoptAuthenticatedUser(identity(userId, email))
  const addresses = useAccountAddresses()
  await flush()
  return addresses
}

/**
 * The address composable is a module-level singleton that outlives a logout and
 * a later login in the same browser tab. These tests pin the rule that it must
 * never expose one user's addresses to the next session.
 */
describe('account address cache isolation', () => {
  beforeAll(() => {
    setActivePinia(createPinia())
  })

  beforeEach(() => {
    resetAccountAddresses()
  })

  it('drops user A’s addresses on logout and loads only user B’s after login', async () => {
    const addresses = await signIn(1, 'a@example.com', [row(11, 'a@example.com'), row(12, 'a-alias@example.com')])
    expect(addresses.accounts.map(item => item.email)).toEqual(['a@example.com', 'a-alias@example.com'])

    // Sign out: the cached rows must be gone before any new page can render.
    clearAuthenticatedSession()
    expect(addresses.accounts).toEqual([])
    expect(useAccountStore().addresses).toEqual([])

    // Sign in as B. The composable must refetch under B's identity.
    mocks.accountList.mockResolvedValue([row(22, 'b@example.com')])
    adoptAuthenticatedUser(identity(2, 'b@example.com'))
    await flush()

    expect(addresses.accounts.map(item => item.email)).toEqual(['b@example.com'])
    expect(addresses.accounts.map(item => item.email)).not.toContain('a-alias@example.com')
    expect(useAccountStore().addresses.map(item => item.email)).toEqual(['b@example.com'])
  })

  it('clears the shared cache when the identity changes without a logout', async () => {
    const addresses = await signIn(3, 'old@example.com', [row(31, 'old@example.com')])
    expect(addresses.accounts).toHaveLength(1)

    mocks.accountList.mockResolvedValue([row(41, 'new@example.com')])
    adoptAuthenticatedUser(identity(4, 'new@example.com'))
    await flush()

    expect(addresses.accounts.map(item => item.email)).toEqual(['new@example.com'])
  })

  it('exposes a synchronous reset for logout paths', async () => {
    const addresses = await signIn(5, 'c@example.com', [row(51, 'c@example.com')])
    expect(addresses.accounts).toHaveLength(1)

    resetAccountAddresses()
    expect(addresses.accounts).toEqual([])
    expect(useAccountStore().addresses).toEqual([])
  })
})
