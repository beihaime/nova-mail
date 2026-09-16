import {createApp} from 'vue';
import './style.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import 'nprogress/nprogress.css';
import UiPreview from '@/views/ui-preview/index.vue'

const isUiPreview = window.location.pathname === '/ui-preview'

if (isUiPreview) {
    // Kept intentionally isolated: no Pinia, init(), router guard, or API imports.
    createApp(UiPreview).mount('#app')
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
    app.use(router).use(i18n).directive('perm', perm)
    app.config.devtools = true
    app.mount('#app')
}
