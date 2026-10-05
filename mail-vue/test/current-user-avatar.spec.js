import { describe, expect, it } from 'vitest'
import { firstVisibleCharacter, resolveCurrentUserAvatar } from '@/utils/current-user-avatar.js'

const user = { name: 'Beihaime', email: 'beihaime@example.com' }
const github = { provider: 'github', connected: true, avatarUrl: 'https://avatars.example/github.png', connectedAt: '2026-01-01 00:00:00', connectionOrder: 10 }
const google = { provider: 'google', connected: true, avatarUrl: 'https://avatars.example/google.png', connectedAt: '2026-01-02 00:00:00', connectionOrder: 11 }

describe('current user avatar resolver', () => {
  it('uses a trimmed first visible username character, including non-Latin names', () => {
    expect(resolveCurrentUserAvatar(user).initial).toBe('B')
    expect(resolveCurrentUserAvatar({ name: '  北海 ', email: user.email }).initial).toBe('北')
    expect(firstVisibleCharacter('  😀 Nova')).toBe('😀')
  })

  it('uses the email initial only when the username is empty', () => {
    expect(resolveCurrentUserAvatar({ name: '  ', email: user.email })).toEqual({ url: '', initial: 'B', source: 'initial' })
  })

  it('keeps custom profile pictures ahead of OAuth avatars', () => {
    expect(resolveCurrentUserAvatar({ ...user, customAvatarUrl: 'https://avatars.example/custom.png' }, [github]))
      .toMatchObject({ url: 'https://avatars.example/custom.png', source: 'custom' })
  })

  it('uses binding order rather than provider name', () => {
    expect(resolveCurrentUserAvatar(user, [github, google]).source).toBe('github')
    expect(resolveCurrentUserAvatar(user, [
      { ...github, connectedAt: '2026-01-02 00:00:00', connectionOrder: 11 },
      { ...google, connectedAt: '2026-01-01 00:00:00', connectionOrder: 10 },
    ]).source).toBe('google')
  })

  it('uses durable connection order when providers were connected in the same second', () => {
    const sameSecond = '2026-01-01 00:00:00'
    expect(resolveCurrentUserAvatar(user, [
      { ...github, connectedAt: sameSecond, connectionOrder: 20 },
      { ...google, connectedAt: sameSecond, connectionOrder: 19 },
    ]).source).toBe('google')
  })

  it('does not make a reconnected provider older than an existing connection', () => {
    expect(resolveCurrentUserAvatar(user, [
      { ...github, connectedAt: '2026-01-03 00:00:00', connectionOrder: 12 },
      google,
    ]).source).toBe('google')
  })

  it('skips OAuth accounts without an avatar and immediately falls through after disconnect', () => {
    expect(resolveCurrentUserAvatar(user, [{ ...github, avatarUrl: '' }, google]).source).toBe('google')
    expect(resolveCurrentUserAvatar(user, [{ ...github, connected: false }, google]).source).toBe('google')
    expect(resolveCurrentUserAvatar(user, [{ ...github, connected: false }, { ...google, connected: false }]).initial).toBe('B')
  })
})
