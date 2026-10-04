import http from '@/axios/index.js';
import { getDeviceId, isInstalledPwa } from '@/utils/device-id.js';

export function login(email, password, token) {
    return http.post('/login', {email: email, password: password, token, device_id: getDeviceId(), pwa: isInstalledPwa()})
}

export function logout(token) {
    return http.delete('/logout', {
        // This is deliberately an explicit, one-off authorization value: the
        // user has already been removed from local state by the click handler.
        logoutToken: token,
        isLogoutRequest: true,
    })
}

export function register(form) {
    return http.post('/register', form)
}
