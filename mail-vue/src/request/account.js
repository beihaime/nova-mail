import http from '@/axios/index.js'

export function accountList(accountId, size, lastSort) {
    return http.get('/account/list', {params: {accountId, size, lastSort}});
}

export function accountAdd(email,token) {
    return http.post('/account/add', {email,token})
}

export function accountSetName(accountId,name) {
    return http.put('/account/setName', {name,accountId})
}

export function accountDelete(accountId) {
    return http.delete('/account/delete', {params: {accountId}})
}

export function accountSetAllReceive(accountId) {
    return http.put('/account/setAllReceive', {accountId})
}

export function accountSetAsTop(accountId) {
    return http.put('/account/setAsTop', {accountId})
}

/**
 * Choose the default sender. The server re-authorizes the id (ownership, active
 * state, send permission) and returns the preference it actually stored, so the
 * caller can render the confirmed state instead of an optimistic guess.
 */
export function accountSetDefaultSender(accountId) {
    return http.put('/account/setDefaultSender', {accountId})
}