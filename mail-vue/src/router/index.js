import {createRouter, createWebHistory} from 'vue-router'
import NProgress from 'nprogress';
import {useUiStore} from "@/store/ui.js";
import {useSettingStore} from "@/store/setting.js";
import {useUserStore} from "@/store/user.js";
import {cvtR2Url} from "@/utils/convert.js";
import {AUTH_NAVIGATION, resolveAuthNavigation} from "@/router/auth-guard.js";

const routes = [
    {
        path: '/',
        name: 'layout',
        redirect: '/inbox',
        component: () => import('@/layout/index.vue'),
        children: [
            {
                path: '/inbox',
                name: 'email',
                component: () => import('@/views/email/index.vue'),
                meta: {
                    title: 'inbox',
                    name: 'email',
                    menu: true
                }
            },
            {
                path: '/unread',
                name: 'unread',
                component: () => import('@/views/email/index.vue'),
                meta: {
                    title: 'unreadMail',
                    name: 'unread',
                    menu: true
                }
            },
            {
                path: '/trash',
                name: 'trash',
                component: () => import('@/views/trash/index.vue'),
                meta: { title: 'trash', name: 'trash', menu: true }
            },
            {
                path: '/mail',
                name: 'content',
                component: () => import('@/views/content/index.vue'),
                meta: {
                    title: 'message',
                    name: 'content',
                    menu: false
                }
            },
            {
                path: '/settings',
                name: 'setting',
                component: () => import('@/views/setting/index.vue'),
                meta: {
                    title: 'settings',
                    name: 'setting',
                    menu: true
                }
            },
            {
                path: '/settings/account',
                redirect: to => ({
                    path: to.query.github || to.query.google
                        ? '/settings/account-security/connected-accounts'
                        : '/settings/account-security',
                    query: to.query
                })
            },
            {
                path: '/settings/account-security',
                name: 'setting-account-security',
                component: () => import('@/views/setting/index.vue'),
                meta: { title: 'accountSecurity', menu: true }
            },
            {
                path: '/settings/account-security/profile',
                name: 'setting-profile',
                component: () => import('@/views/setting/index.vue'),
                meta: { title: 'profile', menu: true }
            },
            {
                path: '/settings/account-security/addresses',
                name: 'setting-addresses',
                component: () => import('@/views/setting/index.vue'),
                meta: { title: 'emailAddresses', menu: true }
            },
            {
                path: '/settings/account-security/connected-accounts',
                name: 'setting-connected-accounts',
                component: () => import('@/views/setting/index.vue'),
                meta: { title: 'connectedAccounts', menu: true }
            },
            {
                path: '/settings/account-security/sessions',
                name: 'setting-sessions',
                component: () => import('@/views/setting/index.vue'),
                meta: { title: 'deviceSessions', menu: true }
            },
            {
                path: '/settings/account-security/delete-account',
                name: 'setting-delete-account',
                component: () => import('@/views/setting/index.vue'),
                meta: { title: 'deleteUser', menu: true }
            },
            {
                path: '/settings/personalization',
                name: 'setting-personalization',
                component: () => import('@/views/setting/index.vue'),
                meta: { title: 'personalization', name: 'setting-personalization', menu: true }
            },
            {
                path: '/settings/about',
                name: 'setting-about',
                component: () => import('@/views/setting/index.vue'),
                meta: { title: 'about', name: 'setting-about', menu: true }
            },
            {
                path: '/settings/addresses',
                redirect: '/settings/account-security/addresses'
            },
            {
                path: '/starred',
                name: 'star',
                component: () => import('@/views/star/index.vue'),
                meta: {
                    title: 'starred',
                    name: 'star',
                    menu: true
                }
            },
            {
                // Where the mobile swipe-to-archive action sends a message. It is
                // the only view that queries `archived = 1`.
                path: '/archive',
                name: 'archive',
                component: () => import('@/views/archive/index.vue'),
                meta: {
                    title: 'archive',
                    name: 'archive',
                    menu: true
                }
            },
        ]

    },
    {
        path: '/login',
        name: 'login',
        component: () => import('@/views/login/index.vue')
    },
    {
        path: '/admin',
        name: 'admin',
        component: () => import('@/layout/admin/index.vue'),
        redirect: '/admin/analytics',
        meta: { admin: true, menu: false },
        children: [
            {
                path: 'analytics',
                name: 'admin-analytics',
                component: () => import('@/views/analysis/index.vue'),
                meta: { admin: true, title: 'analytics' }
            },
            {
                path: 'users',
                name: 'admin-users',
                component: () => import('@/views/user/index.vue'),
                meta: { admin: true, title: 'allUsers' }
            },
            {
                path: 'mail',
                name: 'admin-mail',
                component: () => import('@/views/all-email/index.vue'),
                meta: { admin: true, title: 'allMail' }
            },
            {
                path: 'roles',
                name: 'admin-roles',
                component: () => import('@/views/role/index.vue'),
                meta: { admin: true, title: 'permissions' }
            },
            {
                path: 'invite-codes',
                name: 'admin-invite-codes',
                component: () => import('@/views/reg-key/index.vue'),
                meta: { admin: true, title: 'inviteCode' }
            },
            {
                path: 'settings',
                name: 'admin-settings',
                component: () => import('@/views/sys-setting/index.vue'),
                meta: { admin: true, title: 'SystemSettings' }
            }
        ]
    },
    {
        path: '/test',
        name: 'test',
        component: () => import('@/views/test/index.vue')
    },
    {
        path: '/:pathMatch(.*)*',
        name: '404',
        component: () => import('@/views/404/index.vue')
    }
]


const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
})

NProgress.configure({
    showSpinner: false,   // 不显示旋转图标
    trickleSpeed: 50,    // 自动递增速度
    minimum: 0.1          // 最小百分比
});

let timer
let first = true

router.beforeEach((to, from, next) => {

    if (timer) {
        clearTimeout(timer)
    }

    if (!first) {
        timer = setTimeout(() => {
            NProgress.start()
        }, 100)
    }

    const token = localStorage.getItem('token')

    const decision = resolveAuthNavigation({
        token,
        toPath: to.path,
        fromPath: from.path,
    })

    if (decision.type === AUTH_NAVIGATION.REDIRECT_LOGIN) {
        return next(decision.target)
    }

    if (decision.type === AUTH_NAVIGATION.ALLOW_LOGIN) {
        loadBackground(next)
        return
    }

    if (decision.type === AUTH_NAVIGATION.REDIRECT_AWAY) {
        return next(decision.target)
    }

    const userStore = useUserStore()
    const isAdminRoute = to.matched.some(record => record.meta?.admin)
    const isAdmin = userStore.user?.type === 0
    if (isAdminRoute && !isAdmin) {
        return next({name: 'email'})
    }

    next()

})

function loadBackground(next) {

    const settingStore = useSettingStore();

    if (settingStore.settings.background) {

        const src = cvtR2Url(settingStore.settings.background);

        const img = new Image();
        img.src = src;

        img.onload = () => {
            next()
        };

        img.onerror = () => {
            console.warn("背景图片加载失败:", img.src);
            next()
        };

        setTimeout(() => {
            console.warn("背景加载超时，已放行");
            next()
        }, 3000)

    } else {
        next()
    }

}

router.afterEach((to) => {

    clearTimeout(timer)
    if (first) {
        removeLoading()
    } else {
        NProgress.done();
    }

    const uiStore = useUiStore()
    // The account picker is opened from the message-list toolbar. Keeping it
    // closed by default preserves the desktop reading pane on every route.
    if (to.meta.menu) uiStore.accountShow = false

    if (window.innerWidth < 1025) {
        uiStore.asideShow = false
    }

    first = false
})

function removeLoading() {
    const doc = document.getElementById('loading-first');
    if (!doc) {
        return;
    }

    doc.remove()
}

export default router
