// UI locales actually shipped in src/i18n (zh.js / en.js).
export const SUPPORTED_LOCALES = ['zh', 'en']

export const DEFAULT_LOCALE = 'en'

/**
 * "zh" / "zh-CN" / "zh-Hant-TW" -> "zh"; unsupported or malformed -> null.
 */
export function normalizeLocale(tag) {
    if (typeof tag !== 'string' || !tag) return null
    const base = tag.trim().toLowerCase().split('-')[0]
    return SUPPORTED_LOCALES.includes(base) ? base : null
}

/**
 * Pick the first supported language from the OS preference list
 * (`navigator.languages`, e.g. `['fr-FR', 'zh-CN', 'en-US']` -> `zh`),
 * falling back to `navigator.language`, then English.
 */
export function detectSystemLocale() {
    if (typeof navigator === 'undefined') return DEFAULT_LOCALE

    const preferred =
        Array.isArray(navigator.languages) && navigator.languages.length
            ? navigator.languages
            : [navigator.language]

    for (const tag of preferred) {
        const locale = normalizeLocale(tag)
        if (locale) return locale
    }

    return DEFAULT_LOCALE
}

/**
 * A saved, supported preference wins; anything else falls back to the
 * system language. Used as the *default* so a first-time visitor gets the
 * OS language instead of a hard-coded one.
 */
export function resolveLocale(saved) {
    return normalizeLocale(saved) || detectSystemLocale()
}

/**
 * Keep <html lang> aligned with the UI language so fonts, hyphenation,
 * screen readers and browser translation all match.
 */
export function applyDocumentLocale(locale) {
    if (typeof document === 'undefined') return
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
}
