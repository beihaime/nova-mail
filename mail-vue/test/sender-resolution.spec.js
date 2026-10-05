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
  sendableAddressList,
  senderChoiceFor,
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

  it('falls back to the default when the draft’s sender can no longer send', () => {
    const configured = user({ defaultSender: DEV })
    const addresses = [PRIMARY, DEV, { ...GITHUB, canSend: false }]
    const draft = { sendEmail: 'github@domain.com', accountId: GITHUB.accountId, name: 'github' }

    const sender = resolveDraftSender(draft, configured, addresses)
    expect(sender.sendEmail).toBe('dev@domain.com')
    expect(sender.accountId).toBe(DEV.accountId)
  })

  it('falls back to the default when the draft’s sender was deleted', () => {
    const configured = user({ defaultSender: DEV })
    const draft = { sendEmail: 'github@domain.com', accountId: GITHUB.accountId, name: 'github' }
    // github@ is no longer among the owned addresses.
    const sender = resolveDraftSender(draft, configured, [PRIMARY, DEV])
    expect(sender.sendEmail).toBe('dev@domain.com')
  })

  it('restores the draft verbatim while the address list is still loading', () => {
    const draft = { sendEmail: 'dev@domain.com', accountId: DEV.accountId, name: 'dev' }
    expect(resolveDraftSender(draft, user({ defaultSender: GITHUB }), [])).toEqual({
      sendEmail: 'dev@domain.com',
      accountId: DEV.accountId,
      name: 'dev',
    })
  })

  it('matches the draft by address when its account id no longer lines up', () => {
    const draft = { sendEmail: 'dev@domain.com', accountId: 999, name: 'dev' }
    const sender = resolveDraftSender(draft, user({ defaultSender: GITHUB }), ALIASES)
    expect(sender.accountId).toBe(DEV.accountId)
    expect(sender.sendEmail).toBe('dev@domain.com')
  })
})

describe('composer From choices', () => {
  it('offers only addresses the server says can send', () => {
    const addresses = [
      PRIMARY,
      { ...DEV, canSend: false },
      GITHUB,
      { ...address(4, 'gone@domain.com'), isDel: 1 },
      { accountId: 5, email: 'legacy@domain.com' },
    ]
    expect(sendableAddressList(addresses).map(row => row.email))
      .toEqual(['beihaime@domain.com', 'github@domain.com', 'legacy@domain.com'])
  })

  it('maps a manual choice to the message’s sender fields', () => {
    expect(senderChoiceFor(ALIASES, DEV.accountId)).toEqual({
      sendEmail: 'dev@domain.com',
      accountId: DEV.accountId,
      name: 'dev',
    })
  })

  it('refuses to build a choice from an address that is not offered', () => {
    expect(senderChoiceFor(ALIASES, 999)).toBeNull()
    expect(senderChoiceFor([{ ...DEV, canSend: false }], DEV.accountId)).toBeNull()
    expect(senderChoiceFor([], DEV.accountId)).toBeNull()
  })

  it('changes only the message, never the stored default sender', () => {
    // New compose starts from the configured default...
    const configured = user({ defaultSender: GITHUB })
    const initial = newComposeSender(configured, ALIASES)
    expect(initial.sendEmail).toBe('github@domain.com')

    // ...the composer switches From for this message only...
    const switched = { ...initial, ...senderChoiceFor(ALIASES, DEV.accountId) }
    expect(switched.sendEmail).toBe('dev@domain.com')
    expect(switched.accountId).toBe(DEV.accountId)

    // ...and the preference the next message reads is untouched.
    expect(configured.defaultSender.email).toBe('github@domain.com')
    expect(switched).not.toHaveProperty('defaultSender')
    expect(newComposeSender(configured, ALIASES).sendEmail).toBe('github@domain.com')
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
