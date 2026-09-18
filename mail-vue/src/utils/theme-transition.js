import {useUiStore} from "@/store/ui.js";

/**
 * Reveal centre.
 *
 * Prefer the centre of the control that triggered the switch: on touch screens a
 * tap lands noticeably off-centre (and some mobile browsers report 0/0 for
 * synthetic clicks), which made the reveal look like it started from the wrong
 * spot. Falls back to the pointer position, then to the viewport centre.
 *
 * @param {Event} [event]
 * @returns {{x: number, y: number}}
 */
function resolveRevealOrigin(event) {

    const element =
        event?.currentTarget ||
        event?.target

    const rect =
        typeof element?.getBoundingClientRect === 'function'
            ? element.getBoundingClientRect()
            : null

    if (rect && (rect.width || rect.height)) {
        return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        }
    }

    return {
        x: event?.clientX || window.innerWidth / 2,
        y: event?.clientY || window.innerHeight / 2
    }
}

/**
 * Switch the theme with a circular reveal originating from the triggering
 * control (see `resolveRevealOrigin`).
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

    const origin =
        resolveRevealOrigin(event)

    const width =
        window.innerWidth

    const height =
        window.innerHeight

    // Keep the origin inside the viewport so the circle always anchors on screen.
    const x =
        Math.min(Math.max(origin.x, 0), width)

    const y =
        Math.min(Math.max(origin.y, 0), height)

    const maxX = Math.max(x, width - x)
    const maxY = Math.max(y, height - y)
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
