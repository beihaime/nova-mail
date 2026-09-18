import {useUiStore} from "@/store/ui.js";

/**
 * Switch the theme with a circular reveal originating from the click point.
 *
 * The matching `::view-transition-*` CSS lives in `src/style.css`
 * (`html[data-theme-to="..."]` + `--vt-x/--vt-y/--vt-end-radius`).
 *
 * Falls back to an instant switch when the View Transition API is unavailable
 * (or when there is no pointer position, e.g. a programmatic change).
 *
 * @param {'light'|'dark'|'system'} mode target theme mode
 * @param {MouseEvent} [event] originating click, used as the reveal centre
 */
export function applyThemeTransition(mode, event) {

    const uiStore = useUiStore()
    const root = document.documentElement

    if (!['light', 'dark', 'system'].includes(mode)) return

    const nextDark =
        mode === 'dark' ||
        (
            mode === 'system' &&
            window.matchMedia('(prefers-color-scheme: dark)').matches
        )

    // Nothing to animate when the effective theme does not change.
    if (nextDark === uiStore.dark) {
        uiStore.setThemeMode(mode)
        return
    }

    const startViewTransition =
        document.startViewTransition?.bind(document)

    if (!startViewTransition || !event || event.detail === 0) {
        uiStore.setThemeMode(mode)
        return
    }

    const x = event.clientX
    const y = event.clientY

    const maxX = Math.max(x, window.innerWidth - x)
    const maxY = Math.max(y, window.innerHeight - y)
    const endRadius = Math.hypot(maxX, maxY)

    // 标记切换目标，供 CSS 选择器使用
    root.setAttribute('data-theme-to', mode === 'dark' ? 'dark' : 'light')
    root.style.setProperty('--vt-x', `${x}px`)
    root.style.setProperty('--vt-y', `${y}px`)
    root.style.setProperty('--vt-end-radius', `${endRadius + 10}px`)

    const transition = startViewTransition(() => {
        uiStore.setThemeMode(mode)
    })

    transition.finished.finally(() => {
        // 清理标记
        root.removeAttribute('data-theme-to')
    })
}
