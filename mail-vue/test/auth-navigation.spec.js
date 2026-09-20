import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_NAVIGATION, resolveAuthNavigation } from '../src/router/auth-guard.js'

/**
 * The SPA's auth redirect has two halves: the router guard decides whether a
 * route may open, and the HTTP layer reacts to a 401 from the API. Both are
 * covered here — the guard through its extracted rule, the response interceptor
 * through a stubbed adapter so the real interceptor code runs.
 */

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  navigate: vi.fn(),
  message: vi.fn(),
}))

vi.mock('@/router', () => ({ default: { replace: mocks.replace, push: mocks.navigate } }))
vi.mock('@/store/setting.js', () => ({ useSettingStore: () => ({ lang: 'en' }) }))
vi.mock('@/i18n/index.js', () => ({ default: { global: { t: (key) => key } } }))

const { default: http } = await import('@/axios/index.js')

function adapterReturning(body, { status = 200 } = {}) {
  return async (config) => ({
    data: body,
    status,
    statusText: 'OK',
    headers: {},
    config,
  })
}

describe('route guard', () => {
  it('sends an anonymous visitor to the login page', () => {
    const decision = resolveAuthNavigation({ token: null, toPath: '/inbox', fromPath: '/' })

    expect(decision.type).toBe(AUTH_NAVIGATION.REDIRECT_LOGIN)
    expect(decision.target).toEqual({ name: 'login' })
  })

  it('treats an empty token like no token', () => {
    expect(resolveAuthNavigation({ token: '', toPath: '/mail' }).type).toBe(
      AUTH_NAVIGATION.REDIRECT_LOGIN,
    )
  })

  it('lets an anonymous visitor onto the login page', () => {
    expect(resolveAuthNavigation({ token: null, toPath: '/login' }).type).toBe(
      AUTH_NAVIGATION.ALLOW_LOGIN,
    )
    // Any path under /login, not just the exact route.
    expect(resolveAuthNavigation({ token: null, toPath: '/login/reset' }).type).toBe(
      AUTH_NAVIGATION.ALLOW_LOGIN,
    )
  })

  it('bounces a signed-in visitor away from the login page', () => {
    const decision = resolveAuthNavigation({
      token: 'jwt',
      toPath: '/login',
      fromPath: '/starred',
    })

    expect(decision.type).toBe(AUTH_NAVIGATION.REDIRECT_AWAY)
    expect(decision.target).toBe('/starred')
  })

  it('falls back to the root when there is nowhere to return to', () => {
    const decision = resolveAuthNavigation({ token: 'jwt', toPath: '/login', fromPath: '' })

    expect(decision.type).toBe(AUTH_NAVIGATION.REDIRECT_AWAY)
    expect(decision.target).toBe('/')
  })

  it('proceeds for a signed-in visitor on a protected route', () => {
    expect(resolveAuthNavigation({ token: 'jwt', toPath: '/inbox', fromPath: '/' }).type).toBe(
      AUTH_NAVIGATION.PROCEED,
    )
  })

  it('does not mistake a protected path for the login page', () => {
    // `/login-help` is a different route and must stay protected.
    expect(resolveAuthNavigation({ token: null, toPath: '/login-help' }).type).toBe(
      AUTH_NAVIGATION.REDIRECT_LOGIN,
    )
  })
})

describe('HTTP 401 handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.ElMessage = mocks.message
    localStorage.setItem('token', 'stale-jwt')
  })

  it('clears the session and redirects to login on an expired token', async () => {
    http.defaults.adapter = adapterReturning({ code: 401, message: '登录已过期' })

    await expect(http.get('/email/list')).rejects.toMatchObject({ code: 401 })

    expect(localStorage.getItem('token')).toBeNull()
    expect(mocks.replace).toHaveBeenCalledWith('/login')
    expect(mocks.message).toHaveBeenCalled()
  })

  it('keeps the session on a 403 and does not navigate', async () => {
    http.defaults.adapter = adapterReturning({ code: 403, message: '权限不足' })

    await expect(http.get('/email/send')).rejects.toMatchObject({ code: 403 })

    expect(localStorage.getItem('token')).toBe('stale-jwt')
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('unwraps a successful payload', async () => {
    http.defaults.adapter = adapterReturning({ code: 200, message: 'success', data: { list: [1] } })

    await expect(http.get('/email/list')).resolves.toEqual({ list: [1] })
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('stays silent and still rejects for a noMsg request', async () => {
    http.defaults.adapter = adapterReturning({ code: 500, message: 'boom' })
    mocks.message.mockClear()

    await expect(http.get('/email/latest', { noMsg: true })).rejects.toMatchObject({ code: 500 })
    expect(mocks.message).not.toHaveBeenCalled()
  })
})
