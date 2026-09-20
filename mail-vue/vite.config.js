import {defineConfig, loadEnv} from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import {ElementPlusResolver} from 'unplugin-vue-components/resolvers'
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
    const env = loadEnv(mode, process.cwd(), 'VITE')
    return {
        server: {
            host: true,
            port: 3001,
            hmr: true,
        },
        base: env.VITE_STATIC_URL || '/',
        plugins: [vue(),
            VitePWA({
                injectRegister: 'script-defer',
                includeAssets: [
                    'icons/nova-mail-192.png',
                    'icons/nova-mail-512.png',
                    'icons/nova-mail-maskable-192.png',
                    'icons/nova-mail-maskable-512.png',
                ],
                // Install/launch defaults only: the manifest is static, so it cannot
                // follow the in-app theme. #17191d is the dark value of the
                // `--nova-mobile-header-bg` token (light is #FFFFFF) so the splash
                // and first frame match the dark-grey phone header, not pure black.
                // Runtime status-bar colour is driven by
                // <meta name="theme-color">, which applyTheme() keeps in sync with
                // the effective light/dark theme.
                manifest:{
                    name:'Nova Mail',
                    short_name:'Nova Mail',
                    description:'Nova Mail — your mail, your rules.',
                    start_url:'/',
                    scope:'/',
                    display:'standalone',
                    background_color:'#17191d',
                    theme_color:'#17191d',

                    icons: [
                        {
                            src: '/icons/nova-mail-192.png',
                            sizes: '192x192',
                            type: 'image/png',
                            purpose: 'any',
                        },
                        {
                            src: '/icons/nova-mail-512.png',
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'any',
                        },
                        {
                            src: '/icons/nova-mail-maskable-192.png',
                            sizes: '192x192',
                            type: 'image/png',
                            purpose: 'maskable',
                        },
                        {
                            src: '/icons/nova-mail-maskable-512.png',
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'maskable',
                        }
                    ],
                },
                workbox: {
                    disableDevLogs: true,
                    globPatterns: [],
                    runtimeCaching: [],
                    navigateFallback: null,
                    cleanupOutdatedCaches: true,
                    clientsClaim: true,
                    skipWaiting: true,
                    // Pull the Web Push handlers into the generated worker rather
                    // than running a second service worker for notifications.
                    importScripts: ['push-sw.js'],
                }
            }),
            AutoImport({
                resolvers: [ElementPlusResolver()],
            }),
            Components({
                resolvers: [ElementPlusResolver()],
            })
        ],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src')
            }
        },
        build: {
            target: 'es2022',
            outDir: env.VITE_OUT_DIR || 'dist',
            emptyOutDir: true,
            assetsInclude: ['**/*.json']
        }
    }
})
