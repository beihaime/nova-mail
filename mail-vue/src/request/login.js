import http from '@/axios/index.js';
import { getDeviceId, isInstalledPwa } from '@/utils/device-id.js';

export function login(email, password, token) {
    return http.post('/login', {email: email, password: password, token, device_id: getDeviceId(), pwa: isInstalledPwa()})
}

export function logout() {
    return http.delete('/logout')
}

export function register(form) {
    return http.post('/register', form)
}
