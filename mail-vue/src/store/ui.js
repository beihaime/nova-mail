import { defineStore } from 'pinia'

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
        dark: false,
        themeMode: null,
        asideCount: {
            email: 0,
            send: 0,
            sysEmail: 0
        }
    }),
    actions: {
        showNotice() {
            this.changeNotice ++
        },
        previewNotice(data) {
            this.previewData = data
            this.changePreview ++
        },
        applyTheme() {
            let mode = this.themeMode

            if (!['light', 'dark', 'system'].includes(mode)) {
                // Migrate the old persisted boolean without changing
                // an existing user's current appearance.
                mode = this.dark ? 'dark' : 'light'
                this.themeMode = mode
            }

            const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
            const effectiveDark =
                mode === 'dark' || (mode === 'system' && systemDark)

            this.dark = effectiveDark

            document.documentElement.classList.toggle('dark', effectiveDark)
            document.documentElement.style.colorScheme = effectiveDark ? 'dark' : 'light'

            const metaTag = document.getElementById('theme-color-meta')
            metaTag?.setAttribute(
                'content',
                effectiveDark ? '#141414' : '#FFFFFF'
            )
        },
        setThemeMode(mode) {
            if (!['light', 'dark', 'system'].includes(mode)) return
            this.themeMode = mode
            this.applyTheme()
        }
    },
    persist: {
        pick: ['accountShow','dark','themeMode'],
    },
})
