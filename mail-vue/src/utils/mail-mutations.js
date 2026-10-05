/*
 * Shared optimistic mutation layer for every mail move/remove/restore action.
 *
 * One pipeline owns the snapshot → optimistic-update → persist → rollback/undo
 * flow, so the Inbox, Archive, Sent, Starred, Trash, search results, the opened
 * message and the mobile swipe gesture never grow their own "await, then update"
 * implementation. Components only say *what* happened; this module decides *how*
 * to apply it immediately and reconcile it in the background.
 *
 * A "list controller" is the thin capability surface a list component (the
 * email-scroll virtual list) registers when it mounts. It only knows how to
 * remove/restore rows and counters locally; everything else — snapshots, undo,
 * stale-response protection, persistence and feedback — lives here.
 */

import i18n from '@/i18n/index.js'
import { ElMessage } from 'element-plus'
import { runOptimisticMailMutation } from './optimistic-mail-mutation.js'
import { showUndoSnackbar } from './undo-snackbar.js'
import { useEmailStore } from '@/store/email.js'
import {
  emailArchive,
  emailUnarchive,
  emailDelete,
  emailRestore,
  emailDeleteForever,
  emailEmptyTrash,
} from '@/request/email.js'

const t = key => i18n.global.t(key)

// ---------------------------------------------------------------------------
// Registry: list controllers (one per mounted folder list), the opened-message
// context and the cross-list star clearing hook.
// ---------------------------------------------------------------------------

const controllers = new Map()
let clearStarHook = null
let readerContext = null

/** Register a folder list so mutations can update it optimistically. */
export function registerMailListController(type, controller) {
  controllers.set(type, controller)
}

export function unregisterMailListController(type, controller) {
  if (controllers.get(type) === controller) controllers.delete(type)
}

/** The store-owned cross-list "clear star" helper (archive/trash unstar rows). */
export function setMailClearStarHook(hook) {
  clearStarHook = hook
}

/**
 * The opened-message reader registers `{ emailId, close }` so a mutation that
 * targets the open message closes it immediately instead of waiting for HTTP.
 */
export function setMailReaderContext(context) {
  readerContext = context
}

export function clearMailReaderContext(context) {
  if (readerContext === context) readerContext = null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeIds(ids) {
  const list = Array.isArray(ids) ? ids : (ids == null ? [] : [ids])
  return [...new Set(list.map(Number).filter(Boolean))]
}

function everyController() {
  return [...controllers.values()]
}

function removeEverywhere(ids) {
  const removed = new Map()
  for (const controller of everyController()) {
    const snapshot = controller.remove?.(ids)
    if (snapshot && snapshot.length) removed.set(controller, snapshot)
  }
  return removed
}

function restoreEverywhere(removed) {
  for (const [controller, snapshot] of removed) controller.restore?.(snapshot)
}

function closeReader(ids) {
  if (!readerContext) return
  if (!ids.some(id => Number(id) === Number(readerContext.emailId))) return

  // Detach first so a rapid second mutation cannot navigate away twice.
  const context = readerContext
  clearMailReaderContext(context)
  context.close()
}

/**
 * Forget the affected messages in the reader's own caches. The optimistic list
 * removal already drops the row, but `detailMap` (and any locally appended
 * reply) is what a later same-subject conversation would otherwise rebuild the
 * deleted message from.
 */
function purgeEmailCache(ids) {
  useEmailStore().removeEmails(ids)
}

function failMessage(text) {
  ElMessage({ message: text, type: 'error', plain: true })
}

function successMessage(text) {
  ElMessage({ message: text, type: 'success', plain: true })
}

/**
 * The one removal pipeline behind archive / trash / restore / unarchive /
 * permanent delete. Every flavour only changes the persistence and undo targets.
 */
function runRemoval({
  ids,
  persist,
  undoPersist,
  clearStar = false,
  undoable = false,
  message,
  undoLabel = t('undo'),
  duration,
}) {
  const emailIds = normalizeIds(ids)
  if (!emailIds.length || typeof persist !== 'function') return null

  let removed = new Map()

  const mutation = runOptimisticMailMutation({
    ids: emailIds,
    apply: () => {
      removed = removeEverywhere(emailIds)
      purgeEmailCache(emailIds)
      if (clearStar) clearStarHook?.(emailIds)
      closeReader(emailIds)
    },
    persist: () => persist(emailIds),
    rollback: () => restoreEverywhere(removed),
    onPersistError: error => {
      console.error(error)
      failMessage(t('swipeActionFailMsg'))
    },
    undoApply: undoable ? () => restoreEverywhere(removed) : undefined,
    undoPersist: undoable && typeof undoPersist === 'function'
      ? () => undoPersist(emailIds)
      : undefined,
    redo: undoable
      ? () => {
          removed = removeEverywhere(emailIds)
          purgeEmailCache(emailIds)
          if (clearStar) clearStarHook?.(emailIds)
        }
      : undefined,
    onUndoError: error => {
      console.error(error)
      failMessage(t('undoFailMsg'))
    },
  })

  if (undoable && typeof undoPersist === 'function') {
    showUndoSnackbar({ message, undoLabel, duration, onUndo: () => mutation.undo() })
  } else {
    successMessage(message)
  }

  return mutation
}

// ---------------------------------------------------------------------------
// Public mutation API
// ---------------------------------------------------------------------------

/** Archive: hides from the Inbox immediately; Undo un-archives. */
export function archiveMessages(ids, { message = t('archiveSuccessMsg'), persist = emailArchive, undoPersist = emailUnarchive } = {}) {
  return runRemoval({
    ids,
    persist,
    undoPersist,
    clearStar: true,
    undoable: true,
    message,
  })
}

/** Move to Trash: reversible; Undo restores from Trash. */
export function trashMessages(ids, {
  message = t('delSuccessMsg'),
  persist = emailDelete,
  undoPersist = emailRestore,
  undoable = true,
} = {}) {
  return runRemoval({
    ids,
    persist,
    undoPersist,
    clearStar: true,
    undoable,
    message,
  })
}

/** Restore from Trash: leave Trash immediately; the target folder reconciles later. */
export function restoreMessages(ids, { message = t('restoreSuccessMsg'), persist = emailRestore } = {}) {
  return runRemoval({
    ids,
    persist,
    clearStar: false,
    undoable: false,
    message,
  })
}

/** Restore from Archive (unarchive): leave Archive immediately. */
export function unarchiveMessages(ids, { message = t('unarchiveSuccessMsg'), persist = emailUnarchive } = {}) {
  return runRemoval({
    ids,
    persist,
    clearStar: false,
    undoable: false,
    message,
  })
}

/** Permanent delete in Trash. Confirmation is the caller's responsibility. */
export function permanentlyDeleteMessages(ids, { message = t('delSuccessMsg'), persist = emailDeleteForever } = {}) {
  return runRemoval({
    ids,
    persist,
    clearStar: false,
    undoable: false,
    message,
  })
}

// Empty Trash is a whole-list transaction with its own monotonic token so an
// older failure can never roll back a newer emptying.
let emptyTrashVersion = 0

/** Empty Trash: clear the list now, persist in the background, rollback on failure. */
export function emptyTrash(accountId, { message = t('emptyTrashSuccessMsg') } = {}) {
  const controller = controllers.get('trash')
  if (!controller?.clearAll || !controller?.restoreAll) return null

  const version = ++emptyTrashVersion
  const snapshot = controller.clearAll()
  successMessage(message)

  emailEmptyTrash(accountId).catch(error => {
    if (version !== emptyTrashVersion) return
    controller.restoreAll(snapshot)
    console.error(error)
    failMessage(t('reqFailErrorMsg'))
  })

  return { version, snapshot }
}
