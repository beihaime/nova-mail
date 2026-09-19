/**
 * Browser side of Web Push.
 *
 * The service worker itself is the one vite-plugin-pwa generates (which imports
 * `public/push-sw.js`), so this module only deals with permission, the
 * subscription and keeping the backend in sync.
 *
 * Nothing here throws for the caller: an unsupported browser, a denied
 * permission or a dead endpoint all come back as a status the UI can render —
 * mail itself must never depend on notifications working.
 */

import { pushConfig, pushSubscribe, pushUnsubscribe } from '@/request/push.js'

/** Status values shared with the settings UI. */
export const PUSH_STATUS = {
    UNSUPPORTED: 'unsupported',
    DENIED: 'denied',
    DEFAULT: 'default',
    UNAVAILABLE: 'unavailable',
    GRANTED: 'granted',
    DISABLED: 'disabled',
}

export function pushSupported() {
    return typeof window !== 'undefined'
        && 'serviceWorker' in navigator
        && 'PushManager' in window
        && 'Notification' in window
}

/** VAPID public keys travel as base64url; PushManager wants raw bytes. */
export function urlBase64ToUint8Array(base64Url) {
    const padding = '='.repeat((4 - (String(base64Url).length % 4)) % 4)
    const base64 = String(base64Url).replace(/-/g, '+').replace(/_/g, '/') + padding
    const binary = atob(base64)

    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

async function getRegistration() {
    if (!('serviceWorker' in navigator)) return null

    try {
        // Resolves once the generated worker is active (registration is done by
        // vite-plugin-pwa's injected script).
        return await navigator.serviceWorker.ready
    } catch {
        return null
    }
}

/** This browser's subscription, or null. */
export async function getPushSubscription() {
    const registration = await getRegistration()
    if (!registration?.pushManager) return null

    try {
        return await registration.pushManager.getSubscription()
    } catch {
        return null
    }
}

function serializeSubscription(subscription) {
    const json = typeof subscription.toJSON === 'function' ? subscription.toJSON() : {}

    return {
        endpoint: subscription.endpoint,
        keys: {
            p256dh: json.keys?.p256dh || '',
            auth: json.keys?.auth || '',
        },
        userAgent: navigator.userAgent || '',
    }
}

async function saveSubscription(subscription) {
    await pushSubscribe(serializeSubscription(subscription))
}

/** Current state for the settings page. */
export async function pushState() {
    if (!pushSupported()) {
        return { supported: false, permission: PUSH_STATUS.UNSUPPORTED, subscribed: false }
    }

    const permission = Notification.permission
    const subscription = permission === 'granted' ? await getPushSubscription() : null

    return { supported: true, permission, subscribed: Boolean(subscription) }
}

/**
 * Ask for permission and register this device.
 *
 * @returns {Promise<{status: string, endpoint?: string}>}
 */
export async function enablePush() {
    if (!pushSupported()) return { status: PUSH_STATUS.UNSUPPORTED }

    let permission
    try {
        permission = await Notification.requestPermission()
    } catch {
        return { status: PUSH_STATUS.DENIED }
    }

    if (permission !== 'granted') return { status: permission === 'denied' ? PUSH_STATUS.DENIED : PUSH_STATUS.DEFAULT }

    // The server can only sign pushes when its VAPID keys are configured; stop
    // before the browser stores a subscription nothing can use.
    let config
    try {
        config = await pushConfig()
    } catch {
        return { status: PUSH_STATUS.UNAVAILABLE }
    }

    if (!config?.enabled || !config.publicKey) return { status: PUSH_STATUS.UNAVAILABLE }

    const registration = await getRegistration()
    if (!registration?.pushManager) return { status: PUSH_STATUS.UNSUPPORTED }

    try {
        let subscription = await registration.pushManager.getSubscription()

        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(config.publicKey),
            })
        }

        await saveSubscription(subscription)
        return { status: PUSH_STATUS.GRANTED, endpoint: subscription.endpoint }
    } catch (error) {
        console.warn('Nova Mail: could not enable push notifications', error)
        return { status: PUSH_STATUS.UNAVAILABLE }
    }
}

/** Unregister this device (server first, so a failure cannot orphan the row). */
export async function disablePush() {
    const subscription = await getPushSubscription()
    if (!subscription) return { status: PUSH_STATUS.DISABLED }

    const { endpoint } = subscription

    try {
        await pushUnsubscribe(endpoint)
    } catch (error) {
        console.warn('Nova Mail: could not remove the push subscription', error)
    }

    try {
        await subscription.unsubscribe()
    } catch (error) {
        console.warn('Nova Mail: could not release the local push subscription', error)
    }

    return { status: PUSH_STATUS.DISABLED }
}

/**
 * Re-register an existing local subscription.
 *
 * Covers the two ways the server can lose track of a device: the browser
 * rotating an endpoint, or the row being cleaned up after a 404/410. The upsert
 * is idempotent, so calling it when nothing changed is harmless.
 */
export async function syncPushSubscription() {
    if (!pushSupported() || Notification.permission !== 'granted') return false

    const subscription = await getPushSubscription()
    if (!subscription) return false

    try {
        await saveSubscription(subscription)
        return true
    } catch (error) {
        console.warn('Nova Mail: could not sync the push subscription', error)
        return false
    }
}
