import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
    state: () => ({
        user: {},
        githubAvatar: '',
        githubConnected: false,
        googleAvatar: '',
        googleConnected: false,
        refreshList: 0,
    }),
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
        async refreshGithubAccount() {
            try {
                const {githubConnectedAccount} = await import('@/request/ouath.js')
                const account = await githubConnectedAccount()
                this.githubConnected = Boolean(account?.connected)
                this.githubAvatar = account?.connected && account?.avatarUrl ? account.avatarUrl : ''
                return account
            } catch {
                this.githubConnected = false
                this.githubAvatar = ''
                return { connected: false }
            }
        },
        async refreshGoogleAccount() {
            try {
                const {googleConnectedAccount} = await import('@/request/ouath.js')
                const account = await googleConnectedAccount()
                this.googleConnected = Boolean(account?.connected)
                this.googleAvatar = account?.connected && account?.avatarUrl ? account.avatarUrl : ''
                return account
            } catch {
                this.googleConnected = false
                this.googleAvatar = ''
                return { connected: false }
            }
        }
    }
})
