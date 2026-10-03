/*
 * Shared optimistic mutation primitive for mail state changes.
 *
 * A version is kept per message so an old request can never roll back a newer
 * user intent (Archive → Undo, then Archive again is the common example).
 * Views own their lightweight list snapshots; this module owns ordering and
 * stale-response protection.
 */
const operationVersions = new Map()

function nextVersion(ids) {
  const version = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
  ids.forEach(id => operationVersions.set(String(id), version))
  return version
}

function isCurrent(ids, version) {
  return ids.every(id => operationVersions.get(String(id)) === version)
}

/**
 * Apply immediately, persist in the background and roll back only if this is
 * still the latest operation for every affected message.
 */
export function runOptimisticMailMutation({
  ids,
  apply,
  persist,
  rollback,
  onPersistError,
  undoApply,
  undoPersist,
  redo,
  onUndoError,
} = {}) {
  const uniqueIds = [...new Set((ids || []).map(Number).filter(Boolean))]
  if (!uniqueIds.length) return null

  const version = nextVersion(uniqueIds)
  apply?.()

  Promise.resolve()
    .then(() => persist?.())
    .catch(error => {
      if (!isCurrent(uniqueIds, version)) return
      rollback?.()
      onPersistError?.(error)
    })

  return {
    undo() {
      if (!undoApply || !undoPersist) return false
      const undoVersion = nextVersion(uniqueIds)
      undoApply()

      Promise.resolve()
        .then(() => undoPersist())
        .catch(error => {
          if (!isCurrent(uniqueIds, undoVersion)) return
          // The UI already showed the undo result. Restore the just-mutated
          // state only when that restoration could not be persisted.
          redo?.()
          onUndoError?.(error)
        })
      return true
    },
  }
}
