import { describe, expect, it } from 'vitest'
import {
  SWIPE_ACTION,
  SWIPE_AXIS,
  SWIPE_AXIS_RATIO,
  SWIPE_COMMIT_MAX,
  SWIPE_COMMIT_MIN,
  SWIPE_SLOP,
  clampSwipeOffset,
  resolveSwipeAxis,
  resolveSwipeRelease,
  swipeActionForOffset,
  swipeCommitDistance,
} from '../src/utils/swipe-actions.js'

/**
 * These numbers decide whether a finger scrolls the page or drags a mail row.
 * Getting the axis ratio wrong silently steals vertical scrolling; getting the
 * commit distance wrong either fires actions nobody asked for or makes them
 * unreachable. Both are pure arithmetic, so they are pinned exactly here.
 */

describe('resolveSwipeAxis', () => {
  it('stays undecided inside the slop circle', () => {
    expect(resolveSwipeAxis({ dx: 0, dy: 0 })).toBeNull()
    expect(resolveSwipeAxis({ dx: 3, dy: -4 })).toBeNull()
    expect(resolveSwipeAxis({ dx: SWIPE_SLOP - 1, dy: SWIPE_SLOP - 1 })).toBeNull()
  })

  it('locks horizontal for an unmistakably sideways drag', () => {
    expect(resolveSwipeAxis({ dx: 40, dy: 0 })).toBe(SWIPE_AXIS.HORIZONTAL)
    expect(resolveSwipeAxis({ dx: -40, dy: 0 })).toBe(SWIPE_AXIS.HORIZONTAL)
    expect(resolveSwipeAxis({ dx: 60, dy: 10 })).toBe(SWIPE_AXIS.HORIZONTAL)
  })

  it('keeps vertical scrolling for a straight or diagonal scroll', () => {
    expect(resolveSwipeAxis({ dx: 0, dy: 40 })).toBe(SWIPE_AXIS.VERTICAL)
    expect(resolveSwipeAxis({ dx: 2, dy: 30 })).toBe(SWIPE_AXIS.VERTICAL)
    // 45 degrees is ambiguous, and losing a scroll is worse than missing a swipe.
    expect(resolveSwipeAxis({ dx: 30, dy: 30 })).toBe(SWIPE_AXIS.VERTICAL)
    expect(resolveSwipeAxis({ dx: 10, dy: -20 })).toBe(SWIPE_AXIS.VERTICAL)
  })

  it('requires the documented margin over the vertical component', () => {
    // Exactly at the ratio: horizontal.
    expect(resolveSwipeAxis({ dx: 100, dy: 100 / SWIPE_AXIS_RATIO })).toBe(SWIPE_AXIS.HORIZONTAL)
    // Just under it: vertical.
    expect(resolveSwipeAxis({ dx: 100, dy: 100 / SWIPE_AXIS_RATIO + 1 })).toBe(SWIPE_AXIS.VERTICAL)
  })

  it('honours a custom slop and ratio', () => {
    expect(resolveSwipeAxis({ dx: 5, dy: 0, slop: 4 })).toBe(SWIPE_AXIS.HORIZONTAL)
    expect(resolveSwipeAxis({ dx: 10, dy: 9, ratio: 3 })).toBe(SWIPE_AXIS.VERTICAL)
  })

  it('treats a sideways drag past the slop but with no vertical movement as horizontal', () => {
    expect(resolveSwipeAxis({ dx: SWIPE_SLOP, dy: 0 })).toBe(SWIPE_AXIS.HORIZONTAL)
  })
})

describe('swipeActionForOffset', () => {
  it('reveals Archive when dragging right and Delete when dragging left', () => {
    expect(swipeActionForOffset(1)).toBe(SWIPE_ACTION.ARCHIVE)
    expect(swipeActionForOffset(200)).toBe(SWIPE_ACTION.ARCHIVE)
    expect(swipeActionForOffset(-1)).toBe(SWIPE_ACTION.DELETE)
    expect(swipeActionForOffset(-200)).toBe(SWIPE_ACTION.DELETE)
  })

  it('has no action at exactly zero', () => {
    expect(swipeActionForOffset(0)).toBeNull()
    expect(swipeActionForOffset()).toBeNull()
  })
})

describe('swipeCommitDistance', () => {
  it('scales with the row width inside the clamp', () => {
    // 400 * 0.32 = 128, inside [56, 140].
    expect(swipeCommitDistance(400)).toBeCloseTo(128)
  })

  it('never asks for more than the maximum', () => {
    expect(swipeCommitDistance(2000)).toBe(SWIPE_COMMIT_MAX)
  })

  it('never asks for less than the minimum', () => {
    expect(swipeCommitDistance(100)).toBe(SWIPE_COMMIT_MIN)
  })

  it('falls back to the minimum when the width is unknown', () => {
    expect(swipeCommitDistance(0)).toBe(SWIPE_COMMIT_MIN)
    expect(swipeCommitDistance(undefined)).toBe(SWIPE_COMMIT_MIN)
    expect(swipeCommitDistance('nonsense')).toBe(SWIPE_COMMIT_MIN)
  })
})

describe('clampSwipeOffset', () => {
  it('keeps the card inside the row in both directions', () => {
    expect(clampSwipeOffset(1000, 300)).toBeCloseTo(300 * 0.42)
    expect(clampSwipeOffset(-1000, 300)).toBeCloseTo(-300 * 0.42)
  })

  it('passes through a small offset unchanged', () => {
    expect(clampSwipeOffset(30, 300)).toBe(30)
    expect(clampSwipeOffset(-30, 300)).toBe(-30)
  })

  it('never collapses to a zero-width clamp', () => {
    expect(clampSwipeOffset(50, 0)).toBe(1)
    expect(clampSwipeOffset(-50, 0)).toBe(-1)
  })
})

describe('resolveSwipeRelease', () => {
  it('commits Archive past the threshold when dragged right', () => {
    const result = resolveSwipeRelease({ dx: 200, dy: 4, width: 400 })

    expect(result).toEqual({
      axis: SWIPE_AXIS.HORIZONTAL,
      action: SWIPE_ACTION.ARCHIVE,
      commit: true,
      offset: 168, // clamped to 400 * 0.42
    })
  })

  it('commits Delete past the threshold when dragged left', () => {
    const result = resolveSwipeRelease({ dx: -200, dy: -6, width: 400 })

    expect(result.action).toBe(SWIPE_ACTION.DELETE)
    expect(result.commit).toBe(true)
    expect(result.offset).toBe(-168)
  })

  it('does not commit a short drag, but still reports where the card sits', () => {
    const result = resolveSwipeRelease({ dx: 40, dy: 2, width: 400 })

    expect(result.commit).toBe(false)
    expect(result.action).toBe(SWIPE_ACTION.ARCHIVE)
    expect(result.offset).toBe(40)
  })

  it('refuses to act on a gesture that was a scroll', () => {
    const result = resolveSwipeRelease({ dx: 20, dy: 120, width: 400 })

    expect(result.axis).toBe(SWIPE_AXIS.VERTICAL)
    expect(result.action).toBeNull()
    expect(result.commit).toBe(false)
    expect(result.offset).toBe(0)
  })

  it('treats a gesture that never left the slop as no action', () => {
    const result = resolveSwipeRelease({ dx: 3, dy: 2, width: 400 })

    expect(result.axis).toBeNull()
    expect(result.action).toBeNull()
    expect(result.commit).toBe(false)
    expect(result.offset).toBe(0)
  })

  it('commits exactly at the threshold, not just past it', () => {
    const width = 400
    const threshold = swipeCommitDistance(width)

    expect(resolveSwipeRelease({ dx: threshold, dy: 0, width }).commit).toBe(true)
    expect(resolveSwipeRelease({ dx: threshold - 1, dy: 0, width }).commit).toBe(false)
  })
})
