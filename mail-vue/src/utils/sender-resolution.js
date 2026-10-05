/**
 * Sender-identity resolution for the composer.
 *
 * The server owns the authoritative default-sender resolver
 * (`mail-worker/src/service/sender-address-service.js`) and ships its result on
 * `user.defaultSender`. The composer still needs the same decision locally for
 * one case the server cannot make for it: a reply must start from the address
 * that actually received the message, not from the global default.
 *
 * These helpers are pure so the precedence rules can be tested without mounting
 * the composer, the editor or Element Plus.
 */

/** Same rule the Worker applies: trimmed, lower-cased, comparable address. */
export function normalizeAddress(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function sameAddress(left, right) {
  const a = normalizeAddress(left)
  return Boolean(a) && a === normalizeAddress(right)
}

/** Stored `recipient` / `cc` columns are JSON arrays of `{ address, name }`. */
export function parseAddressList(value) {
  let addresses = value
  try {
    if (typeof addresses === 'string') addresses = JSON.parse(addresses)
  } catch {
    return []
  }
  if (!Array.isArray(addresses)) return []
  return addresses
    .flatMap(item => item?.group || [item])
    .map(item => item?.address)
    .filter(Boolean)
}

/**
 * `canSend` is computed by the server for every address-list row. Rows that
 * predate the field, or the identity's own primary row, are treated as usable
 * so an older cached payload cannot make the composer senderless.
 */
export function isSendableAddress(row) {
  if (!row?.email) return false
  if (Number(row.isDel) === 1) return false
  return row.canSend !== false
}

/**
 * Every address the user owns, in a stable order: the loaded address page first
 * (it carries the server's `canSend` verdict), then the identity's own rows.
 */
export function ownedAddresses(user, addresses = []) {
  const rows = [...(addresses || []), user?.defaultSender, user?.account]
  const seen = new Set()
  const result = []
  for (const row of rows) {
    if (!row?.email) continue
    const key = normalizeAddress(row.email)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(row)
  }
  return result
}

/**
 * The address a brand-new Compose window starts from:
 *
 *   server-resolved default → valid primary → first send-capable owned → none
 *
 * `user.defaultSender` already encodes the whole server chain, so it wins. The
 * remaining steps only run for a payload that does not carry it yet (an older
 * cached session), which keeps new Compose working during a rolling deploy.
 */
export function effectiveSenderAccount(user, addresses = [], currentAccount = null) {
  const resolved = user?.defaultSender
  if (resolved?.email && isSendableAddress(resolved)) return resolved

  const owned = ownedAddresses(user, addresses)
  const primary = owned.find(row => sameAddress(row.email, user?.email))
  if (primary && isSendableAddress(primary)) return primary

  const first = owned.find(isSendableAddress)
  if (first) return first

  return currentAccount?.email ? currentAccount : null
}

/**
 * The address a reply must start from.
 *
 * Nova Mail stores every received message under the mailbox that actually
 * received it (`email.accountId`), which is the canonical record of the local
 * identity — no guessing from rendered text. The parsed To/Cc lists are the
 * fallback for a row that predates that column or whose mailbox id no longer
 * resolves, so a user who was only Cc'd still replies as that identity.
 *
 *   1. the owned, send-capable mailbox the message was delivered to
 *   2. an owned, send-capable identity found in To or Cc
 *   3. the effective default sender (then the current mailbox)
 */
export function resolveReplySenderAccount(email, user, addresses = [], currentAccount = null) {
  const owned = ownedAddresses(user, addresses)
  const sendable = owned.filter(isSendableAddress)

  const receiving = sendable.find(row => row.accountId && row.accountId === email?.accountId)
  if (receiving) return receiving

  const recipients = [...parseAddressList(email?.recipient), ...parseAddressList(email?.cc)]
  for (const address of recipients) {
    const match = sendable.find(row => sameAddress(row.email, address))
    if (match) return match
  }

  return effectiveSenderAccount(user, addresses, currentAccount)
}

/**
 * The `From` fields a composer session carries.
 */
export function composeSenderFields(account, user) {
  if (account?.email) {
    return {
      sendEmail: account.email,
      accountId: account.accountId,
      name: account.name ?? '',
    }
  }
  return {
    sendEmail: user?.email || '',
    accountId: user?.account?.accountId,
    name: user?.name ?? '',
  }
}

/**
 * A brand-new Compose window (and a newly forwarded message) starts from the
 * effective default sender.
 */
export function newComposeSender(user, addresses = [], currentAccount = null) {
  return composeSenderFields(effectiveSenderAccount(user, addresses, currentAccount), user)
}

/**
 * Reopening a draft must never replace the sender it already stored; only a
 * legacy draft that carries no sender at all falls back to the effective
 * default. This is the rule that keeps "change From for one message" from
 * silently becoming a preference change (or a draft rewrite).
 */
export function resolveDraftSender(draft, user, addresses = [], currentAccount = null) {
  if (draft?.sendEmail && draft?.accountId) {
    return {
      sendEmail: draft.sendEmail,
      accountId: draft.accountId,
      name: draft.name ?? '',
    }
  }
  return newComposeSender(user, addresses, currentAccount)
}

/**
 * The user's own identities, used to keep a reply-all from addressing the
 * sender's own mailbox. Deliberately includes unusable addresses: a deleted
 * mailbox is still the user's own identity and must not receive the reply.
 */
export function ownedAddressSet(user, addresses = [], extra = []) {
  const set = new Set()
  for (const row of [...ownedAddresses(user, addresses), ...(extra || [])]) {
    const value = normalizeAddress(row?.email ?? row)
    if (value) set.add(value)
  }
  return set
}
