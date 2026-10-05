import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The shared mail mutation layer is the one pipeline behind every
 * archive/trash/restore/unarchive/permanent-delete/empty-trash action, so these
 * tests assert the contract that matters everywhere: the list changes
 * immediately, persistence runs afterwards, and failures roll back only the
 * latest intent. Request functions, Element Plus and the snackbar are mocked;
 * the registry and the mutation/version logic under test are real.
 */

const mocks = vi.hoisted(() => ({
  elMessage: vi.fn(),
  emailArchive: vi.fn(),
  emailUnarchive: vi.fn(),
  emailDelete: vi.fn(),
  emailRestore: vi.fn(),
  emailDeleteForever: vi.fn(),
  emailEmptyTrash: vi.fn(),
  showUndoSnackbar: vi.fn(),
  removeEmails: vi.fn(),
}))

vi.mock('element-plus', () => ({ ElMessage: mocks.elMessage }))
vi.mock('@/i18n/index.js', () => ({ default: { global: { t: key => key } } }))
vi.mock('@/store/email.js', () => ({
  useEmailStore: () => ({ removeEmails: mocks.removeEmails }),
}))
vi.mock('@/request/email.js', () => ({
  emailArchive: mocks.emailArchive,
  emailUnarchive: mocks.emailUnarchive,
  emailDelete: mocks.emailDelete,
  emailRestore: mocks.emailRestore,
  emailDeleteForever: mocks.emailDeleteForever,
  emailEmptyTrash: mocks.emailEmptyTrash,
}))
vi.mock('@/utils/undo-snackbar.js', () => ({ showUndoSnackbar: mocks.showUndoSnackbar }))

let mailMutations

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function makeController(rows = [
  { emailId: 1, isStar: 0, checked: false },
  { emailId: 2, isStar: 1, checked: false },
]) {
  const list = [...rows]
  return {
    list,
    remove: vi.fn(ids => {
      const idSet = new Set((ids || []).map(Number))
      const snapshot = []
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (idSet.has(Number(list[i].emailId))) {
          snapshot.unshift({ item: list[i], index: i, isStar: list[i].isStar, checked: list[i].checked })
          list.splice(i, 1)
        }
      }
      return snapshot
    }),
    restore: vi.fn(snapshot => {
      for (const entry of [...snapshot].sort((a, b) => a.index - b.index)) {
        if (list.some(row => Number(row.emailId) === Number(entry.item.emailId))) continue
        list.splice(Math.max(0, Math.min(entry.index, list.length)), 0, entry.item)
      }
    }),
    clearAll: vi.fn(() => {
      const snapshot = list.map((item, index) => ({ item, index, isStar: item.isStar, checked: item.checked }))
      list.length = 0
      return snapshot
    }),
    restoreAll: vi.fn(snapshot => {
      for (const entry of [...snapshot].sort((a, b) => a.index - b.index)) {
        if (!list.some(row => Number(row.emailId) === Number(entry.item.emailId))) {
          list.splice(Math.max(0, Math.min(entry.index, list.length)), 0, entry.item)
        }
      }
    }),
    reconcile: vi.fn(),
  }
}

function undoOfLastSnackbar() {
  const calls = mocks.showUndoSnackbar.mock.calls
  return calls[calls.length - 1][0].onUndo
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.emailArchive.mockResolvedValue(undefined)
  mocks.emailUnarchive.mockResolvedValue(undefined)
  mocks.emailDelete.mockResolvedValue(undefined)
  mocks.emailRestore.mockResolvedValue(undefined)
  mocks.emailDeleteForever.mockResolvedValue(undefined)
  mocks.emailEmptyTrash.mockResolvedValue(undefined)
  mailMutations = await import('../src/utils/mail-mutations.js')
})

describe('shared mail mutation layer', () => {
  it('archive removes the row immediately and persists afterwards', async () => {
    const controller = makeController()
    mailMutations.registerMailListController('email', controller)

    mailMutations.archiveMessages([1])

    expect(controller.list.map(r => r.emailId)).toEqual([2])
    // The reader's own cache must forget the row too, or a later same-subject
    // conversation could rebuild it from the stale body.
    expect(mocks.removeEmails).toHaveBeenCalledWith([1])
    expect(mocks.emailArchive).not.toHaveBeenCalled()
    await flush()
    expect(mocks.emailArchive).toHaveBeenCalledWith([1])
    expect(mocks.showUndoSnackbar).toHaveBeenCalledTimes(1)
  })

  it('archive rolls back the removed row when persistence fails', async () => {
    const controller = makeController()
    mailMutations.registerMailListController('email', controller)
    mocks.emailArchive.mockRejectedValue(new Error('offline'))

    mailMutations.archiveMessages([1])
    await flush()

    expect(controller.restore).toHaveBeenCalled()
    expect(controller.list.map(r => r.emailId)).toEqual([1, 2])
    expect(mocks.elMessage).toHaveBeenCalled()
  })

  it('archive undo restores immediately and un-archives in the background', async () => {
    const controller = makeController()
    mailMutations.registerMailListController('email', controller)

    mailMutations.archiveMessages([1])
    undoOfLastSnackbar()()

    expect(controller.list.map(r => r.emailId)).toEqual([1, 2])
    expect(mocks.emailUnarchive).not.toHaveBeenCalled()
    await flush()
    expect(mocks.emailUnarchive).toHaveBeenCalledWith([1])
  })

  it('trash undo restores via the restore endpoint', async () => {
    const controller = makeController()
    mailMutations.registerMailListController('email', controller)

    mailMutations.trashMessages([2])
    expect(controller.list.map(r => r.emailId)).toEqual([1])
    undoOfLastSnackbar()()

    expect(controller.list.map(r => r.emailId)).toEqual([1, 2])
    await flush()
    expect(mocks.emailRestore).toHaveBeenCalledWith([2])
  })

  it('trash without a restore path is not undoable', async () => {
    const controller = makeController()
    mailMutations.registerMailListController('all-email', controller)

    mailMutations.trashMessages([1], { persist: mocks.emailDelete, undoable: false })

    expect(controller.list.map(r => r.emailId)).toEqual([2])
    expect(mocks.showUndoSnackbar).not.toHaveBeenCalled()
    expect(mocks.elMessage).toHaveBeenCalled()
    await flush()
    expect(mocks.emailDelete).toHaveBeenCalledWith([1])
  })

  it('permanent delete removes immediately and persists forever-delete', async () => {
    const controller = makeController()
    mailMutations.registerMailListController('trash', controller)

    mailMutations.permanentlyDeleteMessages([1])

    expect(controller.list.map(r => r.emailId)).toEqual([2])
    await flush()
    expect(mocks.emailDeleteForever).toHaveBeenCalledWith([1])
    expect(mocks.showUndoSnackbar).not.toHaveBeenCalled()
  })

  it('restore leaves Trash immediately and runs in the background', async () => {
    const controller = makeController()
    mailMutations.registerMailListController('trash', controller)

    mailMutations.restoreMessages([1])

    expect(controller.list.map(r => r.emailId)).toEqual([2])
    expect(mocks.emailRestore).not.toHaveBeenCalled()
    await flush()
    expect(mocks.emailRestore).toHaveBeenCalledWith([1])
  })

  it('unarchive leaves Archive immediately and runs in the background', async () => {
    const controller = makeController()
    mailMutations.registerMailListController('archive', controller)

    mailMutations.unarchiveMessages([2])

    expect(controller.list.map(r => r.emailId)).toEqual([1])
    await flush()
    expect(mocks.emailUnarchive).toHaveBeenCalledWith([2])
  })

  it('emptyTrash clears the list and rolls back on failure', async () => {
    const controller = makeController()
    mailMutations.registerMailListController('trash', controller)
    mocks.emailEmptyTrash.mockRejectedValue(new Error('offline'))

    mailMutations.emptyTrash(7)

    expect(controller.list).toHaveLength(0)
    expect(controller.clearAll).toHaveBeenCalled()
    await flush()
    expect(mocks.emailEmptyTrash).toHaveBeenCalledWith(7)
    expect(controller.restoreAll).toHaveBeenCalled()
    expect(controller.list.map(r => r.emailId)).toEqual([1, 2])
  })

  it('closes the open reader before persisting', async () => {
    const controller = makeController()
    mailMutations.registerMailListController('email', controller)
    const close = vi.fn()
    mailMutations.setMailReaderContext({ emailId: 1, close })

    mailMutations.archiveMessages([1])

    expect(close).toHaveBeenCalledTimes(1)
    await flush()
    expect(mocks.emailArchive).toHaveBeenCalledWith([1])
  })

  it('does not close the reader for a different message', async () => {
    const controller = makeController()
    mailMutations.registerMailListController('email', controller)
    const close = vi.fn()
    mailMutations.setMailReaderContext({ emailId: 999, close })

    mailMutations.archiveMessages([1])

    expect(close).not.toHaveBeenCalled()
  })

  it('an older failure never rolls back a newer intent', async () => {
    const controller = makeController()
    mailMutations.registerMailListController('email', controller)

    let rejectFirst
    mocks.emailArchive.mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject }))

    mailMutations.archiveMessages([1])
    await flush()

    // A second archive supersedes the first; the first failure is now stale.
    mailMutations.archiveMessages([1])
    rejectFirst(new Error('stale'))

    await flush()
    expect(controller.list.map(r => r.emailId)).toEqual([2])
  })
})
