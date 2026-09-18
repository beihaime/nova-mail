import { defineStore } from 'pinia'
import { useSettingStore } from './setting.js'

/**
 * Notifications are the site announcement (`setting.notice*`), so "unread" is
 * derived from whether the currently configured announcement has already been
 * opened. Stored per-browser, like an inbox read marker.
 */
const NOTICE_SEEN_KEY = 'nova-notice-seen'

function noticeSignature(settings) {
    const notice = settings || {}

    // notice === 1 means announcements are switched off.
    if (!notice || Number(notice.notice) === 1) return ''

    const title = String(notice.noticeTitle || '')
    const content = String(notice.noticeContent || '')

    if (!title && !content) return ''

    return `${title}::${content}`
}

export const useUiStore = defineStore('ui', {

    state: () => ({
        asideShow: window.innerWidth > 1024,

        accountShow: false,

        backgroundLoading: true,

        changeNotice: 0,

        writerRef: null,

        changePreview: 0,

        previewData: {},

        key: 0,


        // 保留 index.html 首屏主题
        dark:
            window.__NOVA_INITIAL_THEME__?.dark ??
            false,


        themeMode:
            window.__NOVA_INITIAL_THEME__?.mode ??
            'system',


        asideCount: {
            email:0,
            send:0,
            sysEmail:0
        },


        // Unread notification count. 0 hides the badge/dot entirely.
        unreadNotifications: 0
    }),


    actions:{


        /**
         * Recompute the unread notification count from the configured
         * announcement. Safe with missing/partial settings: anything falsy
         * resolves to 0, which hides the dot.
         */
        refreshNotifications(){

            let signature = ''

            try {
                signature = noticeSignature(
                    useSettingStore().settings
                )
            } catch {
                signature = ''
            }

            if (!signature) {
                this.unreadNotifications = 0
                return
            }

            let seen = null

            try {
                seen = localStorage.getItem(NOTICE_SEEN_KEY)
            } catch {
                seen = null
            }

            this.unreadNotifications =
                seen === signature
                    ? 0
                    : 1
        },


        /** Called when the notification (announcement) is opened. */
        markNotificationsRead(){

            let signature = ''

            try {
                signature = noticeSignature(
                    useSettingStore().settings
                )
            } catch {
                signature = ''
            }

            if (signature) {
                try {
                    localStorage.setItem(NOTICE_SEEN_KEY, signature)
                } catch {
                    // storage unavailable — the badge just stays until reload
                }
            }

            this.unreadNotifications = 0
        },


        showNotice(){
            this.changeNotice++
        },


        previewNotice(data){
            this.previewData=data
            this.changePreview++
        },


        applyTheme(){

            let mode=this.themeMode


            if(!['light','dark','system'].includes(mode)){

                mode =
                    window.__NOVA_INITIAL_THEME__?.mode
                    ||
                    (this.dark ? 'dark':'light')


                this.themeMode=mode
            }



            let effectiveDark=false


            if(mode==='dark'){
                effectiveDark=true
            }
            else if(mode==='system'){

                effectiveDark =
                    window.matchMedia(
                        '(prefers-color-scheme: dark)'
                    ).matches

            }



            this.dark=effectiveDark



            const root=document.documentElement


            root.classList.toggle(
                'dark',
                effectiveDark
            )


            root.style.colorScheme =
                effectiveDark
                    ? 'dark'
                    :'light'



            const metaTag =
                document.getElementById(
                    'theme-color-meta'
                )
                ||
                document.querySelector(
                    'meta[name="theme-color"]'
                )


            metaTag?.setAttribute(
                'content',
                effectiveDark
                    ? '#141414'
                    :'#FFFFFF'
            )


            const statusBarMeta =
                document.getElementById(
                    'apple-status-bar-meta'
                )


            statusBarMeta?.setAttribute(
                'content',
                effectiveDark
                    ? 'black'
                    :'default'
            )

        },



        setThemeMode(mode){

            if(![
                'light',
                'dark',
                'system'
            ].includes(mode)) return


            this.themeMode=mode

            this.applyTheme()

        }

    },


    persist:{
        pick:[
            'accountShow',
            'dark',
            'themeMode'
        ]
    }

})