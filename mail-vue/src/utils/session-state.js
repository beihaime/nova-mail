import { useAccountStore } from '@/store/account.js'
import { userDraftStore } from '@/store/draft.js'
import { useEmailStore } from '@/store/email.js'
import { useSettingStore } from '@/store/setting.js'
import { useUiStore } from '@/store/ui.js'
import { useUserStore } from '@/store/user.js'
import { useWriterStore } from '@/store/writer.js'
import { watch } from 'vue'

export function clearUserScopedState() {
  useEmailStore().$reset()
  useWriterStore().$reset()
  userDraftStore().$reset()
  useAccountStore().$reset()
  useUserStore().$reset()
  useSettingStore().mailListDensity = 'normal'

  const ui = useUiStore()
  ui.previewData = {}
  ui.unreadNotifications = 0
  ui.asideCount = { email: 0, send: 0, sysEmail: 0 }

  // Remove data persisted by older builds and user-specific admin searches.
  for (const key of ['email', 'writer', 'all-email-params', 'user-params']) {
    localStorage.removeItem(key)
  }
}

export function clearAuthenticatedSession() {
  localStorage.removeItem('token')
  clearUserScopedState()
}

export function adoptAuthenticatedUser(user) {
  const previous = useUserStore().user
  if (previous?.userId && previous.userId !== user.userId) clearUserScopedState()
  const account = useAccountStore()
  account.currentAccountId = user.account.accountId
  account.currentAccount = user.account
  useUserStore().user = user
}

export function watchMailboxChanges() {
  const account = useAccountStore()
  return watch(() => account.currentAccountId, (current, previous) => {
    if (previous && current !== previous) useEmailStore().clearMailboxContent()
  }, { flush: 'sync' })
}
