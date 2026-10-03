import {useSettingStore} from "@/store/setting.js";
import {loginUserInfo} from "@/request/my.js";
import {permsToRouter} from "@/perm/perm.js";
import router from "@/router";
import {websiteConfig} from "@/request/setting.js";
import i18n from "@/i18n/index.js";
import {resolveLocale, applyDocumentLocale} from "@/i18n/locale.js";
import {loadMailDensity} from '@/utils/mail-density.js';
import {adoptAuthenticatedUser, clearAuthenticatedSession, clearUserScopedState} from '@/utils/session-state.js';

export async function init() {
    document.title = '\u200B'

    // Clear any legacy persisted mail before the authenticated identity is known.
    clearUserScopedState()

    const settingStore = useSettingStore();

    const token = localStorage.getItem('token');

    // Default to the system language; a previously chosen language still wins.
    settingStore.lang = resolveLocale(settingStore.lang)
    i18n.global.locale.value = settingStore.lang
    applyDocumentLocale(settingStore.lang)

    let setting = null;

    if (token) {
        let authError = null;
        const userPromise = loginUserInfo().catch(e => {
            console.error(e);
            authError = e;
            return null;
        });

        const [s, user] = await Promise.all([websiteConfig(), userPromise]);
        setting = s;
        settingStore.settings = setting;
        settingStore.domainList = setting.domainList;
        document.title = setting.title;

        if (user) {
            await loadMailDensity(settingStore);
            adoptAuthenticatedUser(user);

            const routers = permsToRouter(user.permKeys);
            routers.forEach(routerData => {
                router.addRoute('layout', routerData);
            });
        } else {
            // An authentication/database failure must never leave a token in
            // place and let the SPA continue as if the session were valid.
            // Clearing it makes the router fail closed and send the user to
            // the login screen after the boot UI is dismissed.
            clearAuthenticatedSession();
            return { error: authError || new Error('Unable to verify the current session') };
        }

    } else {
        setting = await websiteConfig();
        settingStore.settings = setting;
        settingStore.domainList = setting.domainList;
        document.title = setting.title;
    }

    return null;
}
