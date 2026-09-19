import http from '@/axios/index.js';

export function pushConfig() {
    return http.get('/push/config')
}

/**
 * Register this browser's push subscription. The endpoint is the identity, so
 * calling it again is an idempotent refresh.
 */
export function pushSubscribe(payload) {
    return http.post('/push/subscribe', payload, {noMsg: true})
}

/** Remove one subscription belonging to the current user. */
export function pushUnsubscribe(endpoint) {
    return http.delete('/push/subscribe', {params: {endpoint}, noMsg: true})
}
