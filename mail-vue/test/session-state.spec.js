import { beforeEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { createPinia } from 'pinia'
import piniaPersistedState from 'pinia-plugin-persistedstate'
import { useEmailStore } from '../src/store/email.js'
import { useWriterStore } from '../src/store/writer.js'
import { userDraftStore } from '../src/store/draft.js'
import { useUserStore } from '../src/store/user.js'
import { useAccountStore } from '../src/store/account.js'
import { adoptAuthenticatedUser, clearAuthenticatedSession, clearUserScopedState, watchMailboxChanges } from '../src/utils/session-state.js'
import http from '../src/axios/index.js'

const account = (userId, email) => ({ userId, email, account: { accountId: userId, email } })

describe('same-browser user switching', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('never renders A mail in B session, including before pending requests resolve', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const pinia = createPinia().use(piniaPersistedState)
    let emailStore
    let writerStore
    let draftStore
    const app = createApp({
      setup() {
        emailStore = useEmailStore()
        writerStore = useWriterStore()
        draftStore = userDraftStore()
        return () => h('div', { id: 'mail-reader' }, [
          emailStore.contentData.email?.subject,
          emailStore.contentData.email?.name,
          emailStore.contentData.email?.content,
          JSON.stringify(emailStore.contentData.email?.attList || []),
          JSON.stringify(emailStore.threadMessages),
        ])
      },
    })
    app.use(pinia).mount(root)
    const stopWatchingMailbox = watchMailboxChanges()

    try {
      localStorage.setItem('email', JSON.stringify({ contentData: { email: { content: 'legacy A body' } } }))
      localStorage.setItem('writer', JSON.stringify({ sendRecipientRecord: ['a-private@example.com'] }))
      clearUserScopedState()
      localStorage.setItem('token', 'token-A')
      adoptAuthenticatedUser(account(101, 'a@example.com'))
      emailStore.contentData.email = {
        emailId: 9, subject: 'A secret subject', name: 'A sender', content: 'A secret body',
        attList: [{ filename: 'A attachment' }],
      }
      emailStore.detailMap[9] = emailStore.contentData.email
      emailStore.threadMessages = [{ subject: 'A thread' }]
      emailStore.emailScroll = { emailList: [{ subject: 'A inbox row' }] }
      writerStore.sendRecipientRecord = ['a-private@example.com']
      draftStore.setDraft = { subject: 'A local draft' }
      await nextTick()
      expect(root.textContent).toContain('A secret body')
      expect(localStorage.getItem('email')).toBeNull()
      expect(localStorage.getItem('writer')).toBeNull()

      useAccountStore().currentAccountId = 102
      expect(emailStore.contentData.email).toBeNull()
      expect(emailStore.threadMessages).toEqual([])
      expect(emailStore.emailScroll.emailList).toEqual([])
      // A opens a new message in the selected mailbox before signing out.
      emailStore.contentData.email = {
        emailId: 11, subject: 'A secret subject', name: 'A sender', content: 'A secret body',
        attList: [{ filename: 'A attachment' }],
      }
      emailStore.threadMessages = [{ subject: 'A thread' }]

      let respond
      let requestStarted
      const started = new Promise(resolve => { requestStarted = resolve })
      http.defaults.adapter = config => new Promise(resolve => {
        respond = () => resolve({
          data: { code: 200, data: { emailId: 10, content: 'late A body' } },
          status: 200, statusText: 'OK', headers: {}, config,
        })
        requestStarted()
      })
      const oldRequest = http.get('/email/list').then(data => emailStore.mergeFullEmail(data))
      await started

      clearAuthenticatedSession()
      expect(emailStore.contentData.email).toBeNull()
      expect(emailStore.detailMap).toEqual({})
      expect(emailStore.threadMessages).toEqual([])
      expect(writerStore.sendRecipientRecord).toEqual([])
      expect(draftStore.setDraft).toEqual({})
      expect(useUserStore().user).toEqual({})
      expect(localStorage.getItem('token')).toBeNull()

      localStorage.setItem('token', 'token-B')
      adoptAuthenticatedUser(account(202, 'b@example.com'))
      respond()
      await expect(oldRequest).rejects.toThrow('Session changed')
      await nextTick()
      for (const secret of ['A secret subject', 'A sender', 'A secret body', 'A attachment', 'A thread', 'late A body']) {
        expect(root.textContent).not.toContain(secret)
      }
      expect(useUserStore().user.userId).toBe(202)
    } finally {
      stopWatchingMailbox()
      app.unmount()
      root.remove()
    }
  })

  it('drops a previous mailbox list response after switching accounts', async () => {
    const pinia = createPinia()
    const app = createApp({ render: () => null })
    app.use(pinia).mount(document.createElement('div'))
    const stopWatchingMailbox = watchMailboxChanges()
    try {
      adoptAuthenticatedUser(account(303, 'c@example.com'))
      const emailStore = useEmailStore()
      let resolveList
      const pending = emailStore.fetchList(() => new Promise(resolve => { resolveList = resolve }))
      useAccountStore().currentAccountId = 304
      resolveList({ list: [{ subject: 'Previous mailbox message' }], total: 1 })
      await expect(pending).resolves.toEqual({ list: [], total: 0 })
      expect(emailStore.detailMap).toEqual({})
    } finally {
      stopWatchingMailbox()
      app.unmount()
    }
  })
})
