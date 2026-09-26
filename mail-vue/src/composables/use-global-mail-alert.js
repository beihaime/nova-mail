import { onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { emailLatest } from '@/request/email.js'
import { useAccountStore } from '@/store/account.js'
import { useEmailStore } from '@/store/email.js'
import { useSettingStore } from '@/store/setting.js'
import { alertNewMail, primeMailAlert } from '@/utils/new-mail-alert.js'

/**
 * Global "new mail" detector for the notification sound.
 *
 * The Inbox list and the reader each poll while they are on screen, so this
 * watcher stays completely out of the way on those two routes and only polls on
 * the others (settings, starred, sent, analysis…). That keeps the number of
 * requests identical to before while making the sound work everywhere.
 *
 * It honours the same site setting as the Inbox: `autoRefresh <= 1` means
 * auto-refresh is off, and a watcher cannot detect anything without polling.
 */
export function useGlobalMailAlert() {
    const route = useRoute()
    const accountStore = useAccountStore()
    const emailStore = useEmailStore()
    const settingStore = useSettingStore()

    let timer = null
    let running = false
    let cursor = 0
    let primed = false

    const isOwnDetector = () => route.name === 'email' || route.name === 'content'

    /** Learn the newest existing id so the first poll cannot ring for old mail. */
    async function prime() {
        const accountId = accountStore.currentAccountId
        const allReceive = accountStore.currentAccount?.allReceive

        try {
            const list = await emailLatest(0, accountId, allReceive)
            const rows = Array.isArray(list) ? list : list?.list || []

            cursor = Math.max(cursor, ...rows.map(row => Number(row.emailId) || 0), 0)
            primeMailAlert(rows.map(row => row.emailId))
        } catch (error) {
            console.warn('Nova Mail: could not prime the mail watcher', error)
        }

        primed = true
    }

    async function tick() {
        if (!running) return

        const autoRefresh = Number(settingStore.settings.autoRefresh) || 0

        // Same cadence as the Inbox poll, and the same decision to not poll at
        // all when auto-refresh is disabled.
        if (autoRefresh > 1 && !isOwnDetector() && !document.hidden && primed) {
            const accountId = accountStore.currentAccountId
            const allReceive = accountStore.currentAccount?.allReceive

            // The Inbox/reader may have announced mail since the last tick; catch
            // the cursor up so this poll does not refetch what was already rung.
            cursor = Math.max(cursor, emailStore.notifyCursor || 0)

            try {
                const list = await emailLatest(cursor, accountId, allReceive)
                const rows = Array.isArray(list) ? list : list?.list || []

                if (rows.length) {
                    cursor = Math.max(cursor, ...rows.map(row => Number(row.emailId) || 0))
                    alertNewMail(rows.map(row => row.emailId))
                }
            } catch (error) {
                // 401/403 already redirect through the axios interceptor.
                console.warn('Nova Mail: mail watcher poll failed', error)
            }
        }

        if (running) schedule(autoRefresh)
    }

    function schedule(autoRefresh) {
        clearTimeout(timer)
        timer = setTimeout(tick, autoRefresh > 1 ? autoRefresh * 1000 : 3000)
    }

    onMounted(async () => {
        running = true
        await prime()

        // Another detector may already have announced mail while this was
        // priming; never go backwards.
        cursor = Math.max(cursor, emailStore.notifyCursor || 0)

        schedule(Number(settingStore.settings.autoRefresh) || 0)
    })

    onUnmounted(() => {
        running = false
        clearTimeout(timer)
        timer = null
    })
}
