import { h } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * A short-lived message with one action button — the "Undo" affordance the
 * mobile swipe actions need after they remove a row.
 *
 * Element Plus has no snackbar with an action slot, so this composes one from
 * `ElMessage` plus a VNode. It lives outside the component because the swipe
 * handler should only have to say *what* to undo, not how the toast is built,
 * and because the same contract is reused for both swipe directions.
 */

/** Matches the swipe module's window; keep the two in step. */
export const UNDO_SNACKBAR_MS = 5000

/**
 * @param {object} options
 * @param {string} options.message   what just happened
 * @param {string} [options.undoLabel] button label
 * @param {() => void} [options.onUndo] called once when the button is pressed
 * @param {number} [options.duration]
 * @returns {{ close: () => void, wasUndone: () => boolean }}
 */
export function showUndoSnackbar({
  message,
  undoLabel = 'Undo',
  onUndo,
  duration = UNDO_SNACKBAR_MS,
} = {}) {
  let handle = null
  let undone = false

  const action = h(
    'button',
    {
      type: 'button',
      class: 'nova-undo-action',
      onClick: () => {
        if (undone) return
        undone = true
        handle?.close()
        onUndo?.()
      },
    },
    undoLabel,
  )

  handle = ElMessage({
    message: h('span', { class: 'nova-undo-snackbar' }, [
      h('span', { class: 'nova-undo-text' }, message),
      action,
    ]),
    type: 'info',
    plain: true,
    duration,
    customClass: 'nova-undo-message',
    // Each swipe gets its own handle and its own undo target; merging them
    // would make one button close a notice it does not belong to.
    grouping: false,
  })

  return {
    close: () => handle?.close(),
    wasUndone: () => undone,
  }
}
