import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The request layer is the contract between the views and the Worker routes, so
 * a wrong path or a missing parameter (the Archive view's `archived=1`, for
 * instance) fails silently at runtime. These tests pin the shape of each call.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/axios/index.js', () => ({
  default: { get: mocks.get, put: mocks.put, delete: mocks.delete },
}))

const { emailList, emailDelete, emailArchive, emailUnarchive, emailRestore } = await import(
  '../src/request/email.js'
)

describe('emailList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks for the Inbox by default', () => {
    emailList(7, 0, 0, 0, 50, 0, 1, '')

    const [url, config] = mocks.get.mock.calls[0]
    expect(url).toBe('/email/list')
    expect(config.params).toMatchObject({
      accountId: 7,
      allReceive: 0,
      emailId: 0,
      size: 50,
      type: 0,
      full: 1,
      archived: 0,
    })
  })

  it('forwards archived=1 for the Archive view', () => {
    emailList(7, 0, 12, 0, 50, 0, 1, '', 1)

    expect(mocks.get.mock.calls[0][1].params.archived).toBe(1)
  })

  it('still forwards the search keyword alongside the flag', () => {
    emailList(7, 1, 0, 1, 20, 0, 0, 'invoice', 1)

    const { params } = mocks.get.mock.calls[0][1]
    expect(params.keyword).toBe('invoice')
    expect(params.archived).toBe(1)
    expect(params.timeSort).toBe(1)
    expect(params.allReceive).toBe(1)
  })
})

describe('delete and the swipe action routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes with a comma-joined id list', () => {
    emailDelete([4, 5])

    expect(mocks.delete).toHaveBeenCalledWith('/email/delete?emailIds=4,5')
  })

  it('archives by posting the id list in the body', () => {
    emailArchive([9])

    expect(mocks.put).toHaveBeenCalledWith('/email/archive', { emailIds: [9] })
  })

  it('unarchives through its own route, so undo cannot re-archive', () => {
    emailUnarchive([9])

    expect(mocks.put).toHaveBeenCalledWith('/email/unarchive', { emailIds: [9] })
  })

  it('restores a deleted message through the undo route', () => {
    emailRestore([11, 12])

    expect(mocks.put).toHaveBeenCalledWith('/email/restore', { emailIds: [11, 12] })
  })
})
