import { describe, expect, it } from 'vitest'
import {
  composeSenderFields,
  effectiveSenderAccount,
  isSendableAddress,
  newComposeSender,
  ownedAddressSet,
  parseAddressList,
  resolveDraftSender,
  resolveReplySenderAccount,
} from '../src/utils/sender-resolution.js'

/**
 * Sender-identity precedence for the composer.
 *
 * The server ships the already-resolved effective default on
 * `user.defaultSender`; these helpers decide what a brand-new Compose, a reply
 * and a reopened draft each start from. The reply rule is the delicate one: a
 * user with several identities must answer from the mailbox that received the
 * message, never from the global default.
 */

const user = (overrides = {}) => ({
  email: 'beihaime@domain.com',
  name: 'beihaime',
  account: { accountId: 1, email: 'beihaime@domain.com', name: 'beihaime' },
  defaultSender: null,
  ...overrides,
})

const address = (accountId, email, extra = {}) => ({
  accountId, email, name: email.split('@')[0], canSend: true, ...extra,
})

const PRIMARY = address(1, 'beihaime@domain.com')
const DEV = address(2, 'dev@domain.com')
const GITHUB = address(3, 'github@domain.com')
const ALIASES = [PRIMARY, DEV, GITHUB]

/** A message stored under `accountId`, as Nova Mail records a received mail. */
const received = (accountId, overrides = {}) => ({
  emailId: 10,
  accountId,
  sendEmail: 'someone@outside.example',
  recipient: JSON.stringify([{ address: 'github@domain.com', name: '' }]),
  cc: '[]',
  ...overrides,
})

describe('effective default sender', () => {
  it('prefers the configured default the server resolved', () => {
    const current = user({ defaultSender: DEV })
    expect(effectiveSenderAccount(current, ALIASES).email).toBe(DEV.email)
    expect(newComposeSender(current, ALIASES).sendEmail).toBe(DEV.email)
    expect(newComposeSender(current, ALIASES).accountId).toBe(DEV.accountId)
  })

  it('falls back to the primary address when nothing is configured', () => {
    // The server returns the primary as `defaultSender` for a legacy user.
    expect(newComposeSender(user({ defaultSender: PRIMARY }), ALIASES).sendEmail)
      .toBe('beihaime@domain.com')

    // Even without any server-resolved value the local chain reaches the primary
    // rather than the mailbox the user happens to be viewing.
    const fields = newComposeSender(user(), ALIASES, DEV)
    expect(fields.sendEmail).toBe('beihaime@domain.com')
    expect(fields.accountId).toBe(PRIMARY.accountId)
  })

  it('uses the first usable address when there is no primary', () => {
    const current = user({ email: 'other@domain.com', account: null })
    const withoutPrimary = [DEV, GITHUB]
    const fields = newComposeSender(current, withoutPrimary, null)
    expect(fields.sendEmail).toBe(DEV.email)
  })

  it('never chooses an address the server marked unsendable', () => {
    const current = user()
    const addresses = [
      address(1, 'beihaime@domain.com', { canSend: false }),
      address(2, 'dev@domain.com'),
    ]
    expect(effectiveSenderAccount(current, addresses).email).toBe('dev@domain.com')
    const repaired = { ...PRIMARY, canSend: false }
    expect(isSendableAddress(repaired)).toBe(false)
  })

  it('keeps a legacy payload without canSend usable', () => {
    expect(isSendableAddress({ email: 'x@domain.com' })).toBe(true)
    expect(isSendableAddress({ email: 'x@domain.com', isDel: 1 })).toBe(false)
  })
})

describe('new compose', () => {
  it('initializes From from the configured default, not the viewed mailbox', () => {
    const configured = user({ defaultSender: DEV })
    const fields = newComposeSender(configured, ALIASES, GITHUB)
    expect(fields.sendEmail).toBe('dev@domain.com')
    expect(fields.accountId).toBe(DEV.accountId)
  })

  it('degrades to the identity when the user owns no usable address', () => {
    expect(composeSenderFields(null, user())).toEqual({
      sendEmail: 'beihaime@domain.com',
      accountId: 1,
      name: 'beihaime',
    })
  })
})

describe('draft reopening', () => {
  it('keeps the sender the draft already stored', () => {
    const draft = { sendEmail: 'dev@domain.com', accountId: DEV.accountId, name: 'dev' }
    const configured = user({ defaultSender: GITHUB })
    expect(resolveDraftSender(draft, configured, ALIASES)).toEqual({
      sendEmail: 'dev@domain.com',
      accountId: DEV.accountId,
      name: 'dev',
    })
  })

  it('initializes only a legacy draft that stored no sender', () => {
    const configured = user({ defaultSender: GITHUB })
    const sender = resolveDraftSender({ subject: 'old draft' }, configured, ALIASES)
    expect(sender.sendEmail).toBe('github@domain.com')
    expect(sender.accountId).toBe(GITHUB.accountId)
  })
})

describe('reply sender', () => {
  it('answers from the mailbox that received the message, not the default', () => {
    const configured = user({ defaultSender: DEV })
    const email = received(GITHUB.accountId)

    const sender = resolveReplySenderAccount(email, configured, ALIASES, PRIMARY)
    expect(sender.email).toBe('github@domain.com')
  })

  it('answers from a Cc’d owned identity when that is how it arrived', () => {
    const configured = user({ defaultSender: DEV })
    // The row carries no delivered mailbox id (a legacy row), so the parsed
    // recipients decide.
    const email = received(0, {
      accountId: 0,
      recipient: JSON.stringify([{ address: 'someone@outside.example', name: '' }]),
      cc: JSON.stringify([{ address: 'github@domain.com', name: '' }]),
    })

    expect(resolveReplySenderAccount(email, configured, ALIASES, PRIMARY).email)
      .toBe('github@domain.com')
  })

  it('falls back to the effective default when the receiving address is gone', () => {
    const configured = user({ defaultSender: DEV })
    // github@ was deleted: it is not in the owned list any more.
    const remaining = [PRIMARY, DEV]
    const email = received(GITHUB.accountId)

    const sender = resolveReplySenderAccount(email, configured, remaining, PRIMARY)
    expect(sender.email).toBe('dev@domain.com')
  })

  it('falls back to the effective default when the receiving address cannot send', () => {
    const configured = user({ defaultSender: DEV })
    const addresses = [PRIMARY, DEV, { ...GITHUB, canSend: false }]
    const email = received(GITHUB.accountId)

    expect(resolveReplySenderAccount(email, configured, addresses, PRIMARY).email)
      .toBe('dev@domain.com')
  })

  it('excludes every owned identity from reply-all recipients', () => {
    const configured = user({ defaultSender: DEV })
    const email = received(GITHUB.accountId, {
      recipient: JSON.stringify([{ address: 'github@domain.com', name: '' }]),
      cc: JSON.stringify([{ address: 'dev@domain.com', name: '' }, { address: 'friend@outside.example', name: '' }]),
    })
    const sender = resolveReplySenderAccount(email, configured, ALIASES, PRIMARY)
    const excluded = ownedAddressSet(configured, ALIASES, [sender.email, email.sendEmail])

    expect(excluded.has('dev@domain.com')).toBe(true)
    expect(excluded.has('beihaime@domain.com')).toBe(true)
    expect(excluded.has('github@domain.com')).toBe(true)
    expect(excluded.has('friend@outside.example')).toBe(false)
  })
})

describe('forward', () => {
  it('uses the effective default sender', () => {
    const configured = user({ defaultSender: DEV })
    // `openForward` resets the form and calls `open()` with no preferred
    // account, so the new-compose rule is the forward rule.
    expect(newComposeSender(configured, ALIASES, GITHUB).sendEmail).toBe('dev@domain.com')
  })
})

describe('stored recipient parsing', () => {
  it('reads the canonical JSON columns, including groups', () => {
    expect(parseAddressList(JSON.stringify([{ address: 'a@x.com', name: '' }]))).toEqual(['a@x.com'])
    expect(parseAddressList(JSON.stringify([{ group: [{ address: 'b@x.com' }] }]))).toEqual(['b@x.com'])
    expect(parseAddressList('not json')).toEqual([])
    expect(parseAddressList(null)).toEqual([])
  })
})
