import { useEmailStore } from '@/store/email.js'
import { useSettingStore } from '@/store/setting.js'
import { playNotificationSound } from '@/utils/notificationSound.js'

/**
 * Ring once for the newest genuinely-new mail.
 *
 * Three places detect new mail — the Inbox list poll, the reader's conversation
 * poll and the global watcher (any other route) — and exactly one of them is
 * active at a time. They still race across a route change (the global watcher
 * rings on the settings page, then the Inbox loads that same mail), so every
 * detector reports through here and the shared cursor decides:
 *
 *   - mail whose id is not newer than the cursor was already announced;
 *   - the cursor advances even when the sound is off, so enabling it later does
 *     not fire for a backlog.
 *
 * @param {Array<number|string>} ids email ids that were just found
 * @returns {boolean} whether a sound was started
 */
export function alertNewMail(ids) {
  const emailStore = useEmailStore()
  const settingStore = useSettingStore()

  const newestId = Math.max(0, ...(ids || []).map(id => Number(id) || 0))
  if (!newestId) return false
  if (newestId <= (emailStore.notifyCursor || 0)) return false

  emailStore.notifyCursor = newestId

  if (!settingStore.notificationSound) return false

  playNotificationSound(settingStore.notificationSoundType)
  return true
}

/** Remember mail that existed before this session, without ringing for it. */
export function primeMailAlert(ids) {
  const emailStore = useEmailStore()
  const newestId = Math.max(0, ...(ids || []).map(id => Number(id) || 0))

  if (newestId > (emailStore.notifyCursor || 0)) {
    emailStore.notifyCursor = newestId
  }
}
