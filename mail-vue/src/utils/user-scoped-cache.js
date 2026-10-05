// A tiny registry for caches that live outside Pinia (for example a module-level
// composable singleton). `clearUserScopedState()` must be able to drop them on
// logout without importing the composable directly: the composable's request
// layer imports axios, which imports session-state, so a static import here would
// create a cycle.
const resetters = new Set()

/**
 * Register a callback that discards every value cached for the signed-in user.
 * Called once per cache at module/singleton creation.
 */
export function registerUserScopedCacheReset(reset) {
  if (typeof reset === 'function') resetters.add(reset)
}

/** Discard every registered user-scoped cache. Safe to call with none registered. */
export function resetUserScopedCaches() {
  for (const reset of resetters) {
    try {
      reset()
    } catch {
      // One broken cache must not stop the others from being cleared.
    }
  }
}
