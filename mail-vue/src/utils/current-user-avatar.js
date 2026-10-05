/**
 * One resolver for the signed-in user's avatar.  Keep this intentionally
 * independent from Vue so every surface (and unit tests) uses identical rules.
 */
export function firstVisibleCharacter(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  const character = Array.from(text)[0] || ''
  return character.toLocaleUpperCase()
}

function usableUrl(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function accountOrder(account) {
  // `connectionOrder` is the durable oauth_account_id supplied by the API.
  // connectedAt makes the response understandable to other clients; the ID
  // breaks same-second timestamp ties without relying on provider/object order.
  const timestamp = Date.parse(account?.connectedAt || account?.createdAt || '')
  return [Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER,
    Number.isFinite(Number(account?.connectionOrder)) ? Number(account.connectionOrder) : Number.MAX_SAFE_INTEGER]
}

export function resolveCurrentUserAvatar(user = {}, connectedAccounts = []) {
  const customUrl = usableUrl(user.customAvatarUrl || user.profileAvatarUrl || user.avatarUrl || user.avatar)
  if (customUrl) return { url: customUrl, initial: '', source: 'custom' }

  const oauth = (Array.isArray(connectedAccounts) ? connectedAccounts : [])
    .filter(account => account?.connected && ['github', 'google'].includes(account.provider) && usableUrl(account.avatarUrl))
    .sort((left, right) => {
      const [leftTime, leftOrder] = accountOrder(left)
      const [rightTime, rightOrder] = accountOrder(right)
      return leftTime - rightTime || leftOrder - rightOrder
    })

  if (oauth[0]) return { url: usableUrl(oauth[0].avatarUrl), initial: '', source: oauth[0].provider }

  return {
    url: '',
    initial: firstVisibleCharacter(user.name) || firstVisibleCharacter(user.displayName) || firstVisibleCharacter(user.email) || '?',
    source: 'initial',
  }
}
