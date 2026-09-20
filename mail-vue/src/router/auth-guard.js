/**
 * The rule that decides where a navigation goes, based on the stored session.
 *
 * Extracted from the router guard so it can be exercised directly: importing
 * `router/index.js` in a test drags in Vue Router, NProgress and lazily
 * imported `.vue` components, which would mean mounting a whole app to assert
 * three branches. The guard is the security boundary for the SPA, so it is
 * worth testing on its own.
 */

export const AUTH_NAVIGATION = {
  /** No session, protected route: send the visitor to the login page. */
  REDIRECT_LOGIN: 'redirect-login',
  /** No session, login route: allowed (the caller may await a background image). */
  ALLOW_LOGIN: 'allow-login',
  /** Session present, login route: bounce back to where they came from. */
  REDIRECT_AWAY: 'redirect-away',
  /** Session present, protected route: proceed. */
  PROCEED: 'proceed',
}

/**
 * True for the login route and anything nested under it.
 *
 * Deliberately not `startsWith('/login')`: that would also match a route such
 * as `/login-help`, letting an anonymous visitor through to a page that is not
 * the login screen.
 */
function isLoginPath(path) {
  const value = String(path || '')
  return value === '/login' || value.startsWith('/login/')
}

/**
 * @param {{ token?: string|null, toPath?: string, fromPath?: string }} input
 * @returns {{ type: string, target?: unknown }}
 */
export function resolveAuthNavigation({ token, toPath, fromPath }) {
  const goingToLogin = isLoginPath(toPath)

  if (!token) {
    return goingToLogin
      ? { type: AUTH_NAVIGATION.ALLOW_LOGIN }
      : { type: AUTH_NAVIGATION.REDIRECT_LOGIN, target: { name: 'login' } }
  }

  if (goingToLogin) {
    return { type: AUTH_NAVIGATION.REDIRECT_AWAY, target: fromPath || '/' }
  }

  return { type: AUTH_NAVIGATION.PROCEED }
}
