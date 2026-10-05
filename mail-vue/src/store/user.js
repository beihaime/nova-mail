import { defineStore } from 'pinia'
import { resolveCurrentUserAvatar } from '@/utils/current-user-avatar.js'

export const useUserStore = defineStore('user', {
    state: () => ({
        user: {},
        connectedAccounts: [],
        refreshList: 0,
    }),
    getters: {
        currentAvatar(state) {
            return resolveCurrentUserAvatar(state.user, state.connectedAccounts)
        },
    },
    actions: {
        async refreshUserList() {
            const {loginUserInfo} = await import('@/request/my.js')
            loginUserInfo().then(user => {
                this.refreshList ++
            })
        },
        async refreshUserInfo() {
            const {loginUserInfo} = await import('@/request/my.js')
            loginUserInfo().then(async user => {
                const {adoptAuthenticatedUser} = await import('@/utils/session-state.js')
                adoptAuthenticatedUser(user)
            })
        },
        setConnectedAccount(provider, account = {}) {
            const next = {
                provider,
                connected: Boolean(account?.connected),
                avatarUrl: account?.avatarUrl || '',
                connectedAt: account?.connectedAt || account?.createdAt || '',
                connectionOrder: account?.connectionOrder,
                login: account?.login,
                email: account?.email,
            }
            const index = this.connectedAccounts.findIndex(item => item.provider === provider)
            if (index === -1) this.connectedAccounts.push(next)
            else this.connectedAccounts.splice(index, 1, next)
            return next
        },
        markAvatarUnavailable(url) {
            if (!url) return
            for (const account of this.connectedAccounts) {
                if (account.avatarUrl === url) account.avatarUrl = ''
            }
            for (const key of ['customAvatarUrl', 'profileAvatarUrl', 'avatarUrl', 'avatar']) {
                if (this.user?.[key] === url) this.user[key] = ''
            }
        },
        async refreshConnectedAccounts() {
            const [github, google] = await Promise.all([this.refreshGithubAccount(), this.refreshGoogleAccount()])
            return { github, google }
        },
        async refreshGithubAccount() {
            try {
                const {githubConnectedAccount} = await import('@/request/ouath.js')
                const account = await githubConnectedAccount()
                this.setConnectedAccount('github', account)
                return account
            } catch {
                const account = { connected: false }
                this.setConnectedAccount('github', account)
                return account
            }
        },
        async refreshGoogleAccount() {
            try {
                const {googleConnectedAccount} = await import('@/request/ouath.js')
                const account = await googleConnectedAccount()
                this.setConnectedAccount('google', account)
                return account
            } catch {
                const account = { connected: false }
                this.setConnectedAccount('google', account)
                return account
            }
        }
    }
})
