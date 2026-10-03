import { defineStore } from 'pinia'
import {loginUserInfo} from "@/request/my.js";
import {githubConnectedAccount, googleConnectedAccount} from "@/request/ouath.js";

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
        refreshUserList() {
            loginUserInfo().then(user => {
                this.refreshList ++
            })
        },
        refreshUserInfo() {
            loginUserInfo().then(async user => {
                const {adoptAuthenticatedUser} = await import('@/utils/session-state.js')
                adoptAuthenticatedUser(user)
            })
        },
        async refreshGithubAccount() {
            try {
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
