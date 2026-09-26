import { defineStore } from 'pinia'
import { DEFAULT_NOTIFICATION_SOUND } from '@/utils/notificationSound.js'

export const useSettingStore = defineStore('setting', {
    state: () => ({
        domainList: [],
        settings: {
            r2Domain: '',
            loginOpacity: 1.00,
        },
        lang: '',
        // Personal notification preferences. Persisted alongside `lang` so they
        // survive reloads and the installed PWA without a server round trip.
        notificationSound: true,
        notificationSoundType: DEFAULT_NOTIFICATION_SOUND,
    }),
    actions: {

    },
    persist: {
        pick: ['lang', 'notificationSound', 'notificationSoundType'],
    },
})
