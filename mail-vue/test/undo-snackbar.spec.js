import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The undo snackbar is the only way back from a swipe, so its contract matters:
 * exactly one undo action, the handler fires once, and the notice closes when it
 * does. Element Plus is mocked because the point is the wiring, not the toast.
 */

const mocks = vi.hoisted(() => ({
  message: vi.fn(),
  close: vi.fn(),
}))

vi.mock('element-plus', () => ({ ElMessage: mocks.message }))

const { UNDO_SNACKBAR_MS, showUndoSnackbar } = await import('../src/utils/undo-snackbar.js')

/** Pull the options object ElMessage was called with. */
function optionsOfLastCall() {
  return mocks.message.mock.calls[mocks.message.mock.calls.length - 1][0]
}

/** The undo button VNode inside the message. */
function undoButton(options) {
  return options.message.children[1]
}

describe('showUndoSnackbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.message.mockReturnValue({ close: mocks.close })
  })

  it('renders the message with a single undo action', () => {
    showUndoSnackbar({ message: 'Archived', undoLabel: 'Undo', onUndo: vi.fn() })

    expect(mocks.message).toHaveBeenCalledTimes(1)

    const options = optionsOfLastCall()
    expect(options.type).toBe('info')
    expect(options.duration).toBe(UNDO_SNACKBAR_MS)
    expect(options.customClass).toBe('nova-undo-message')
    // Each swipe owns its notice, so identical toasts must not be merged.
    expect(options.grouping).toBe(false)

    const [text, button] = options.message.children
    expect(text.children).toBe('Archived')
    expect(button.children).toBe('Undo')
    expect(button.props.type).toBe('button')
  })

  it('calls the handler and closes the notice when undo is pressed', () => {
    const onUndo = vi.fn()
    showUndoSnackbar({ message: 'Deleted', onUndo })

    const button = undoButton(optionsOfLastCall())
    button.props.onClick()

    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(mocks.close).toHaveBeenCalledTimes(1)
  })

  it('does not fire the handler twice if the button is pressed again', () => {
    const onUndo = vi.fn()
    const snackbar = showUndoSnackbar({ message: 'Deleted', onUndo })

    const button = undoButton(optionsOfLastCall())
    button.props.onClick()
    button.props.onClick()

    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(snackbar.wasUndone()).toBe(true)
  })

  it('reports that nothing was undone while the window is open', () => {
    const snackbar = showUndoSnackbar({ message: 'Archived', onUndo: vi.fn() })

    expect(snackbar.wasUndone()).toBe(false)
  })

  it('accepts a custom duration and label', () => {
    showUndoSnackbar({ message: 'Archived', undoLabel: '撤销', duration: 8000, onUndo: vi.fn() })

    const options = optionsOfLastCall()
    expect(options.duration).toBe(8000)
    expect(undoButton(options).children).toBe('撤销')
  })

  it('tolerates a missing undo handler', () => {
    showUndoSnackbar({ message: 'Archived' })

    expect(() => undoButton(optionsOfLastCall()).props.onClick()).not.toThrow()
  })
})
