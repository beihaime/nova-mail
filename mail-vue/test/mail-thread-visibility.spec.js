import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildThreadMessages, isVisibleMessage } from '../src/utils/mail-thread.js'
import { useEmailStore } from '../src/store/email.js'

/**
 * The reader assembles a conversation from the server response plus its own
 * cached bodies. These tests pin the rule that a message's Trash / deletion
 * state travels with the message, so opening a later same-subject mail can never
 * rebuild a deleted one from an in-memory cache.
 */

const row = (overrides) => ({
  emailId: 1,
  accountId: 1,
  subject: 'Test',
  threadId: 't1',
  trashed: 0,
  isDel: 0,
  sendEmail: 'sender@outside.example',
  content: 'body',
  ...overrides,
})

describe('conversation visibility', () => {
  it('never pulls a trashed sibling into a normal conversation', () => {
    const primary = row({ emailId: 2, subject: 'Test', threadId: 't1' })
    const deleted = row({ emailId: 1, subject: 'Test', threadId: 't1', trashed: 1, content: 'deleted body' })

    const { messages } = buildThreadMessages(primary, [deleted])

    expect(messages.map(message => message.emailId)).toEqual([2])
    expect(messages.map(message => message.content)).not.toContain('deleted body')
  })

  it('never pulls a visible sibling into a Trash conversation', () => {
    const primary = row({ emailId: 1, subject: 'Test', threadId: 't1', trashed: 1 })
    const visible = row({ emailId: 2, subject: 'Test', threadId: 't1' })

    const { messages } = buildThreadMessages(primary, [visible])

    expect(messages.map(message => message.emailId)).toEqual([1])
  })

  it('excludes a soft-deleted (isDel) row even when it is not trashed', () => {
    const primary = row({ emailId: 3, subject: 'Soft', threadId: 't9' })
    const legacyDeleted = row({ emailId: 4, subject: 'Soft', threadId: 't9', isDel: 1 })

    const { messages } = buildThreadMessages(primary, [legacyDeleted])

    expect(messages.map(message => message.emailId)).toEqual([3])
  })

  it('does not merge two conversations that only share a subject', () => {
    const primary = row({ emailId: 5, subject: 'Hello', threadId: 't2' })
    const unrelated = row({ emailId: 6, subject: 'Hello', threadId: 't3' })

    const { messages } = buildThreadMessages(primary, [unrelated])

    expect(messages.map(message => message.emailId)).toEqual([5])
  })

  it('still groups legacy rows that have no server conversation key', () => {
    const primary = row({ emailId: 7, subject: 'Re: Legacy', threadId: '' })
    const sibling = row({ emailId: 8, subject: 'Legacy', threadId: '' })

    const { messages } = buildThreadMessages(primary, [sibling])

    expect(messages.map(message => message.emailId)).toEqual([7, 8])
  })

  it('reports visibility from trashed / isDel state', () => {
    expect(isVisibleMessage(row({}))).toBe(true)
    expect(isVisibleMessage(row({ trashed: 1 }))).toBe(false)
    expect(isVisibleMessage(row({ isDel: 1 }))).toBe(false)
  })
})

describe('email store cache purge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('drops deleted messages from every in-memory cache', () => {
    const store = useEmailStore()
    store.detailMap[1] = row({ emailId: 1 })
    store.detailMap[2] = row({ emailId: 2 })
    store.contentData.email = row({ emailId: 1 })
    store.threadMessages = [row({ emailId: 1 }), row({ emailId: 3 })]

    store.removeEmails([1])

    expect(store.detailMap[1]).toBeUndefined()
    expect(store.detailMap[2]).toBeDefined()
    expect(store.contentData.email).toBeNull()
    expect(store.threadMessages.map(message => message.emailId)).toEqual([3])
  })
})
