/**
 * Vitest setup for the frontend suites (jsdom).
 *
 * jsdom does not expose `localStorage` for the environment's document origin, so
 * it is missing both as a bare global and on `window`. The application reads it
 * directly (`localStorage.getItem('token')` in the router guard and in the axios
 * request interceptor), so tests of the auth path need a working store.
 *
 * A minimal in-memory implementation is installed only when the environment
 * provides nothing, and behaves like the real Storage API for the methods the
 * app uses.
 */
// Read the availability off `window` rather than `globalThis`: recent Node
// versions define a `globalThis.localStorage` getter that emits an experimental
// warning when touched, and jsdom's window answers the question without it.
const hasStorage =
  typeof window !== 'undefined' ? typeof window.localStorage !== 'undefined' : typeof globalThis.localStorage !== 'undefined'

if (!hasStorage) {
  const store = new Map()

  const storage = {
    get length() {
      return store.size
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    getItem: (key) => (store.has(String(key)) ? store.get(String(key)) : null),
    setItem: (key, value) => {
      store.set(String(key), String(value))
    },
    removeItem: (key) => {
      store.delete(String(key))
    },
    clear: () => {
      store.clear()
    },
  }

  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: storage, configurable: true })
  }
}
