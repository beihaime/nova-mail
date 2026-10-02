import { defineStore } from 'pinia'
import { useSettingStore } from './setting.js'
import {
    APPEARANCE_SCHEMA_VERSION,
    DEFAULT_PALETTES,
    applyPaletteTokens,
    clonePalette,
    availablePresets,
    findMatchingPreset,
    migrateAppearanceConfig,
    normalizePalette,
    paletteForPreset,
    resolvePaletteMode,
} from '@/utils/theme-palette.js'

/**
 * Notifications are the site announcement (`setting.notice*`), so "unread" is
 * derived from whether the currently configured announcement has already been
 * opened. Stored per-browser, like an inbox read marker.
 */
const NOTICE_SEEN_KEY = 'nova-notice-seen'

/**
 * Mobile chrome colour. `style.css` defines `--nova-mobile-header-bg` as an alias
 * of `--nova-surface`, and the phone app bar, its `safe-area-inset-top` strip
 * and the document background all paint from it. Reading the same token here
 * keeps `<meta name="theme-color">` (the Android/PWA status bar) and the iOS
 * status-bar style in lockstep with the header, so there is one colour instead
 * of a near-black bar over a dark-grey header. The map below is only the
 * first-paint fallback for when the token cannot be resolved yet.
 */
const MOBILE_HEADER_BG_TOKEN = '--nova-mobile-header-bg'

const MOBILE_HEADER_BG_FALLBACK = {
    light: '#ffffff',
    dark: '#17191d'
}

function mobileHeaderBackground(isDark) {

    const fallback =
        isDark
            ? MOBILE_HEADER_BG_FALLBACK.dark
            : MOBILE_HEADER_BG_FALLBACK.light

    if (
        typeof window === 'undefined'
        ||
        typeof window.getComputedStyle !== 'function'
    ) {
        return fallback
    }

    let declared = ''

    try {
        declared =
            window
                .getComputedStyle(document.documentElement)
                .getPropertyValue(MOBILE_HEADER_BG_TOKEN)
                .trim()
    } catch {
        declared = ''
    }

    // Some engines hand back the unresolved `var(...)` chain, and a missing
    // stylesheet yields an empty string — both fall back to the literal.
    if (!declared || declared.includes('var(')) {
        return fallback
    }

    return declared
}

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

        // Versioned independently from the rest of persisted UI state. This
        // lets the palette layer repair legacy/partial values deterministically.
        appearanceVersion: APPEARANCE_SCHEMA_VERSION,

        // Light and dark are intentionally independent. System mode simply
        // resolves one of these two palettes from the operating system.
        lightPalette: clonePalette(DEFAULT_PALETTES.light),
        darkPalette: clonePalette(DEFAULT_PALETTES.dark),
        lightThemePreset: 'nova-default',
        darkThemePreset: 'nova-default',


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

            const appearance = migrateAppearanceConfig(this)
            this.appearanceVersion = appearance.appearanceVersion
            this.lightPalette = appearance.lightPalette
            this.darkPalette = appearance.darkPalette
            this.lightThemePreset = appearance.lightThemePreset
            this.darkThemePreset = appearance.darkThemePreset

            let mode=this.themeMode


            if(!['light','dark','system'].includes(mode)){

                mode =
                    window.__NOVA_INITIAL_THEME__?.mode
                    ||
                    (this.dark ? 'dark':'light')


                this.themeMode=mode
            }



            const paletteMode = resolvePaletteMode(
                mode,
                window.matchMedia('(prefers-color-scheme: dark)').matches
            )
            const effectiveDark = paletteMode === 'dark'



            this.dark=effectiveDark


            const paletteKey = `${paletteMode}Palette`
            const presetKey = `${paletteMode}ThemePreset`
            this[paletteKey] = normalizePalette(this[paletteKey], DEFAULT_PALETTES[paletteMode])
            this[presetKey] = findMatchingPreset(paletteMode, this[paletteKey])



            const root=document.documentElement


            applyPaletteTokens(root, this[paletteKey], paletteMode)


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


            // Android / installed-PWA status bar: match the phone header exactly.
            metaTag?.setAttribute(
                'content',
                mobileHeaderBackground(effectiveDark)
            )


            const statusBarMeta =
                document.getElementById(
                    'apple-status-bar-meta'
                )


            // iOS ignores `theme-color`; `black-translucent` lets the app paint
            // the status-bar strip itself, so the header/safe-area colour shows
            // through instead of the system's pure black.
            statusBarMeta?.setAttribute(
                'content',
                effectiveDark
                    ? 'black-translucent'
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

        },


        setThemePalette(mode, palette){

            if (!['light', 'dark'].includes(mode)) return

            this[`${mode}Palette`] = normalizePalette(palette, DEFAULT_PALETTES[mode])
            this[`${mode}ThemePreset`] = findMatchingPreset(mode, this[`${mode}Palette`])
            this.applyTheme()

        },


        setThemePreset(mode, preset){

            if (!['light', 'dark'].includes(mode)) return
            if (!availablePresets(mode).includes(preset)) return

            // Named presets always come as a light/dark pair. Applying both
            // here means a later appearance-mode toggle keeps the selected
            // theme instead of falling back to the other mode's old palette.
            for (const paletteMode of ['light', 'dark']) {
                if (!availablePresets(paletteMode).includes(preset)) continue
                this[`${paletteMode}Palette`] = paletteForPreset(paletteMode, preset)
                this[`${paletteMode}ThemePreset`] = preset
            }
            this.applyTheme()

        },


        resetThemePalette(mode){

            if (!['light', 'dark'].includes(mode)) return
            this[`${mode}Palette`] = clonePalette(DEFAULT_PALETTES[mode])
            this[`${mode}ThemePreset`] = 'nova-default'
            this.applyTheme()

        }

    },


    persist:{
        pick:[
            'accountShow',
            'dark',
            'themeMode',
            'appearanceVersion',
            'lightPalette',
            'darkPalette',
            'lightThemePreset',
            'darkThemePreset'
        ]
    }

})
