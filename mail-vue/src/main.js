import {createApp} from 'vue';
import './style.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import 'nprogress/nprogress.css';
import UiPreview from '@/views/ui-preview/index.vue'
import AppIcon from '@/components/app-icon/index.vue'

const isUiPreview = window.location.pathname === '/ui-preview'

// A redeploy replaces the hashed lazy chunks. If this page was served from a
// stale entry point (cached HTML, or an old service worker), importing a chunk
// 404s and Vite emits `vite:preloadError`. Reload once to pick up the new build
// instead of leaving the user on a broken screen.
const PRELOAD_RELOAD_KEY = 'nova-preload-reload'

window.addEventListener('vite:preloadError', (event) => {
    if (sessionStorage.getItem(PRELOAD_RELOAD_KEY) === '1') return
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, '1')
    event.preventDefault()
    window.location.reload()
})

if (isUiPreview) {
    // Kept intentionally isolated: no Pinia, init(), router guard, or API imports.
    createApp(UiPreview).component('AppIcon', AppIcon).mount('#app')
    sessionStorage.removeItem(PRELOAD_RELOAD_KEY)
} else {
    const [{default: App}, {default: router}, {init}, {createPinia}, {default: piniaPersistedState}, {default: i18n}, {default: perm}] = await Promise.all([
        import('./App.vue'),
        import('./router'),
        import('@/init/init.js'),
        import('pinia'),
        import('pinia-plugin-persistedstate'),
        import('@/i18n/index.js'),
        import('@/perm/perm.js'),
    ])
    const pinia = createPinia().use(piniaPersistedState)
    const app = createApp(App).use(pinia)
    await init()
    app.use(router).use(i18n).directive('perm', perm).component('AppIcon', AppIcon)
    app.config.devtools = true
    app.mount('#app')
    sessionStorage.removeItem(PRELOAD_RELOAD_KEY)
}
