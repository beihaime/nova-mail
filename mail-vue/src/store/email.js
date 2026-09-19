import { defineStore } from 'pinia'
import { EmailUnreadEnum } from '@/enums/email-enum.js'

export const useEmailStore = defineStore('email', {
    state: () => ({
        deleteIds: 0,
        starScroll: null,
        emailScroll: null,
        cancelStarEmailId: 0,
        addStarEmailId: 0,
        contentData: {
            email: null,
            delType: null,
            showStar: true,
            showReply: true,
            showUnread: false
        },
        sendScroll: null,
        detailMap: {},
        searchKeyword: '',
        // Client-side query behind the phone Inbox search field. It lives in the
        // store so the field can render inside the mobile header while
        // email-scroll keeps filtering the loaded list. Not persisted.
        mobileSearch: '',
        // Replies/forwards sent this session, shown in the conversation thread
        // immediately without waiting for a list refresh. Not persisted.
        threadMessages: [],
        // Highest email id already announced by a notification sound. Shared by
        // the Inbox poll, the reader poll and the global watcher so the same
        // mail never rings twice (e.g. right after switching route). Session
        // only, never persisted.
        notifyCursor: 0,
    }),
    persist: {
        pick: ['contentData'],
    },
    actions: {
        fetchList(request) {
            return request(0).then(data => {
                request(1).then(fullData => {
                    const list = Array.isArray(fullData) ? fullData : fullData?.list
                    this.applyFullList(list)
                }).catch(e => {
                    console.error(e)
                })
                return data
            })
        },
        applyFullList(list) {
            if (!list?.length) return
            const currentId = this.contentData.email?.emailId
            for (const item of list) {
                if (!item?.emailId) continue
                if (!item.attList) item.attList = []
                // 完整列表可能早于「标已读」返回，避免把本地已读状态盖回未读
                const prev = this.detailMap[item.emailId]
                const keepRead = prev?.unread === EmailUnreadEnum.READ
                    || (currentId === item.emailId && this.contentData.email?.unread === EmailUnreadEnum.READ)
                if (keepRead) {
                    item.unread = EmailUnreadEnum.READ
                }
                this.detailMap[item.emailId] = item
                if (currentId && item.emailId === currentId) {
                    this.contentData.email = item
                }
            }
        },
        toContentEmail(email) {
            const id = email?.emailId
            if (id && this.detailMap[id]) {
                return this.detailMap[id]
            }
            return {
                ...email,
                emailId: id || 0,
                content: '',
                text: '',
                attList: [],
                recipient: email?.recipient || '[]',
            }
        },
        markListRead(emailId) {
            const scrolls = [this.emailScroll, this.starScroll, this.sendScroll]
            for (const scroll of scrolls) {
                const list = scroll?.emailList
                if (!list?.length) continue
                const item = list.find(e => e.emailId === emailId)
                if (item) item.unread = EmailUnreadEnum.READ
            }
        },
        /**
         * Merge a freshly fetched full email row (with `content`) into the
         * store so the reader renders its body.
         */
        mergeFullEmail(row) {
            if (!row?.emailId) return

            this.detailMap[row.emailId] = row

            if (Number(this.contentData.email?.emailId) === Number(row.emailId)) {
                this.contentData.email = row
            }
        },
        /**
         * Show a freshly sent reply/forward inside its conversation thread
         * straight away, instead of waiting for the list to be refetched.
         * Expects the email row returned by `POST /email/send`.
         */
        appendThreadMessage(email) {
            if (!email) return

            const emailId = Number(email.emailId) || 0
            if (emailId && this.threadMessages.some(item => Number(item.emailId) === emailId)) {
                return
            }

            this.threadMessages.push({
                ...email,
                emailId,
                attList: email.attList || [],
                local: true,
            })

            if (this.threadMessages.length > 50) {
                this.threadMessages.splice(0, this.threadMessages.length - 50)
            }
        },
    },
})
