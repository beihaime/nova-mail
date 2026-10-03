import { describe, expect, it, vi } from 'vitest'
import { runOptimisticMailMutation } from '../src/utils/optimistic-mail-mutation.js'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('optimistic mail mutations', () => {
  it('updates immediately and persists asynchronously', async () => {
    const apply = vi.fn()
    const persist = vi.fn().mockResolvedValue(undefined)

    runOptimisticMailMutation({ ids: [1, 2], apply, persist })

    expect(apply).toHaveBeenCalledOnce()
    expect(persist).not.toHaveBeenCalled()
    await flush()
    expect(persist).toHaveBeenCalledOnce()
  })

  it('rolls back a failed latest mutation', async () => {
    const rollback = vi.fn()
    runOptimisticMailMutation({
      ids: [9],
      apply: vi.fn(),
      persist: vi.fn().mockRejectedValue(new Error('offline')),
      rollback,
    })

    await flush()
    expect(rollback).toHaveBeenCalledOnce()
  })

  it('does not let an older failed response roll back a newer intent', async () => {
    let rejectFirst
    const rollbackFirst = vi.fn()
    runOptimisticMailMutation({
      ids: [4],
      apply: vi.fn(),
      persist: () => new Promise((_, reject) => { rejectFirst = reject }),
      rollback: rollbackFirst,
    })
    await flush()

    runOptimisticMailMutation({ ids: [4], apply: vi.fn(), persist: vi.fn().mockResolvedValue(undefined) })
    rejectFirst(new Error('stale failure'))
    await flush()

    expect(rollbackFirst).not.toHaveBeenCalled()
  })

  it('undoes locally before its restore request resolves', async () => {
    const undoApply = vi.fn()
    const undoPersist = vi.fn().mockResolvedValue(undefined)
    const mutation = runOptimisticMailMutation({
      ids: [3],
      apply: vi.fn(),
      persist: vi.fn().mockResolvedValue(undefined),
      undoApply,
      undoPersist,
    })

    expect(mutation.undo()).toBe(true)
    expect(undoApply).toHaveBeenCalledOnce()
    expect(undoPersist).not.toHaveBeenCalled()
    await flush()
    expect(undoPersist).toHaveBeenCalledOnce()
  })
})
