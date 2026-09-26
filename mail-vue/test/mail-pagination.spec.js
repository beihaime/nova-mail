import { describe, expect, it } from 'vitest'
import { canRequestPage, isLastPage, nextPageCursor } from '../src/utils/mail-pagination.js'

/**
 * The message list loads pages with a "before this id" cursor. A wrong cursor
 * silently drops or repeats mail, so the rules are pinned here.
 */
describe('nextPageCursor', () => {
  it('asks for the newest page when nothing is loaded', () => {
    expect(nextPageCursor([])).toBe(0)
    expect(nextPageCursor(null)).toBe(0)
    expect(nextPageCursor(undefined)).toBe(0)
  })

  it('uses the oldest loaded id, not the newest', () => {
    const list = [{ emailId: 90 }, { emailId: 42 }, { emailId: 7 }]

    expect(nextPageCursor(list)).toBe(7)
  })

  it('coerces a string id, since ids arrive from query-friendly JSON', () => {
    expect(nextPageCursor([{ emailId: '128' }])).toBe(128)
  })

  it('degrades to 0 rather than NaN for an unusable id', () => {
    expect(nextPageCursor([{ emailId: 'not-a-number' }])).toBe(0)
    expect(nextPageCursor([{}])).toBe(0)
  })

  it('walks a mailbox page by page and ends exactly once', () => {
    const pageSize = 50
    // 120 messages: two full pages then a partial one.
    let remaining = Array.from({ length: 120 }, (_, index) => 120 - index)
    const seen = []
    let cursor = 0
    let requests = 0

    while (true) {
      const page = remaining
        .filter((id) => id < cursor || cursor === 0)
        .slice(0, pageSize)
        .map((emailId) => ({ emailId }))

      requests += 1
      seen.push(...page.map((row) => row.emailId))
      if (isLastPage(page.length, pageSize)) break
      cursor = nextPageCursor(page)
      if (requests > 10) throw new Error('pagination never terminated')
    }

    expect(requests).toBe(3)
    expect(seen).toHaveLength(120)
    expect(new Set(seen).size).toBe(120)
    // Strictly descending: no page ever overlaps the previous one.
    expect(seen).toEqual([...seen].sort((a, b) => b - a))
  })
})

describe('isLastPage', () => {
  it('is false only for a full page', () => {
    expect(isLastPage(50, 50)).toBe(false)
    expect(isLastPage(49, 50)).toBe(true)
    expect(isLastPage(0, 50)).toBe(true)
  })

  it('treats an over-full page as not-last', () => {
    expect(isLastPage(51, 50)).toBe(false)
  })
})

describe('canRequestPage', () => {
  it('allows a request only when idle', () => {
    expect(canRequestPage({})).toBe(true)
    expect(canRequestPage({ loading: false, noLoading: false, reqLock: false })).toBe(true)
  })

  it('refuses while a request is in flight, locked, or the list is exhausted', () => {
    expect(canRequestPage({ loading: true })).toBe(false)
    expect(canRequestPage({ noLoading: true })).toBe(false)
    expect(canRequestPage({ reqLock: true })).toBe(false)
  })
})
