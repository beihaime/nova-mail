/**
 * Gesture maths for the mobile swipe actions.
 *
 * The rules that decide whether a finger is scrolling the page or dragging a
 * mail row are pure arithmetic, so they live here rather than inside the
 * virtual list: a wrong ratio silently eats vertical scrolling, and a wrong
 * commit distance either fires actions nobody asked for or makes them
 * unreachable. Keeping the numbers testable is the point.
 *
 * Directions follow the product spec: dragging the card to the **right** reveals
 * the Archive action underneath the leading edge, dragging it to the **left**
 * reveals Delete.
 */

export const SWIPE_ACTION = {
  ARCHIVE: 'archive',
  DELETE: 'delete',
}

export const SWIPE_AXIS = {
  HORIZONTAL: 'horizontal',
  VERTICAL: 'vertical',
}

/** Movement in either axis before an axis decision is made at all. */
export const SWIPE_SLOP = 8

/**
 * How much more horizontal than vertical a gesture must be before it locks.
 * Above 1, so a diagonal drag is treated as a scroll: losing a scroll feels far
 * worse than missing a swipe.
 */
export const SWIPE_AXIS_RATIO = 1.4

/** Fraction of the row width that commits the action when the finger lifts. */
export const SWIPE_COMMIT_RATIO = 0.32

/** The commit distance is clamped into this range so narrow and wide rows both feel right. */
export const SWIPE_COMMIT_MIN = 56
export const SWIPE_COMMIT_MAX = 140

/** How far the card may travel, as a fraction of the row width. */
export const SWIPE_MAX_RATIO = 0.42

/** How long the undo snackbar stays available. */
export const SWIPE_UNDO_MS = 5000

/**
 * Decide the gesture's axis, or null while it is still within the slop circle.
 *
 * @returns {'horizontal'|'vertical'|null}
 */
export function resolveSwipeAxis({
  dx = 0,
  dy = 0,
  slop = SWIPE_SLOP,
  ratio = SWIPE_AXIS_RATIO,
} = {}) {
  const absX = Math.abs(dx)
  const absY = Math.abs(dy)

  if (absX < slop && absY < slop) return null
  // Mostly vertical (or straight down): let the page scroll.
  if (absX < slop || absX < absY * ratio) return SWIPE_AXIS.VERTICAL

  return SWIPE_AXIS.HORIZONTAL
}

/** Which action a horizontal offset commits to, or null at exactly zero. */
export function swipeActionForOffset(dx = 0) {
  if (dx > 0) return SWIPE_ACTION.ARCHIVE
  if (dx < 0) return SWIPE_ACTION.DELETE
  return null
}

/** Distance the card must travel before releasing commits the action. */
export function swipeCommitDistance(
  width,
  { ratio = SWIPE_COMMIT_RATIO, min = SWIPE_COMMIT_MIN, max = SWIPE_COMMIT_MAX } = {},
) {
  const rowWidth = Number(width) || 0
  if (rowWidth <= 0) return min

  return Math.min(max, Math.max(min, rowWidth * ratio))
}

/** Keep the card's travel inside the row, whatever the finger does. */
export function clampSwipeOffset(dx, width, maxRatio = SWIPE_MAX_RATIO) {
  const limit = Math.max(1, (Number(width) || 0) * maxRatio)
  const value = Number(dx) || 0

  return Math.max(-limit, Math.min(limit, value))
}

/**
 * Everything the pointerup handler needs.
 *
 * @returns {{ axis: string|null, action: string|null, commit: boolean, offset: number }}
 */
export function resolveSwipeRelease({
  dx = 0,
  dy = 0,
  width = 0,
  slop,
  axisRatio,
  commitRatio,
  commitMin,
  commitMax,
  maxRatio,
} = {}) {
  const axis = resolveSwipeAxis({ dx, dy, slop, ratio: axisRatio })

  if (axis !== SWIPE_AXIS.HORIZONTAL) {
    return { axis, action: null, commit: false, offset: 0 }
  }

  return {
    axis,
    action: swipeActionForOffset(dx),
    commit:
      Math.abs(dx) >=
      swipeCommitDistance(width, { ratio: commitRatio, min: commitMin, max: commitMax }),
    offset: clampSwipeOffset(dx, width, maxRatio),
  }
}
