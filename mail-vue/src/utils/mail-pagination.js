/**
 * Cursor rules for the message list.
 *
 * The virtual list in `components/email-scroll/index.vue` loads pages by
 * "before this id" cursor, and decides whether the mailbox is exhausted by
 * comparing the page it got with the page size it asked for. Those two rules
 * were inline in a 2500-line component, where only a mounted app could reach
 * them; they are the part of pagination most likely to regress (an off-by-one
 * cursor silently drops or repeats mail), so they live here and are tested
 * directly.
 */

/**
 * The cursor for the next page: the oldest id currently loaded.
 *
 * @param {Array<{ emailId?: number|string }>} list
 * @returns {number} 0 asks the server for the newest page
 */
export function nextPageCursor(list) {
  if (!Array.isArray(list) || list.length === 0) return 0
  const last = list[list.length - 1]
  return Number(last?.emailId) || 0
}

/**
 * True when the server returned less than a full page, i.e. nothing older is
 * left. An empty page also ends paging.
 *
 * @param {number} returnedCount
 * @param {number} pageSize
 */
export function isLastPage(returnedCount, pageSize) {
  return Number(returnedCount) < Number(pageSize)
}

/**
 * Whether a follow-up (non-refresh) page may be requested.
 *
 * A refresh deliberately bypasses this: it replaces the list, so a pending
 * "load more" or an exhausted mailbox must not block it.
 *
 * @param {{ loading?: boolean, noLoading?: boolean, reqLock?: boolean }} state
 */
export function canRequestPage({ loading = false, noLoading = false, reqLock = false } = {}) {
  return !loading && !noLoading && !reqLock
}
