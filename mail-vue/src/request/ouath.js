import http from '@/axios/index.js';

export function githubOauthComplete(grant) {
    return http.post('/oauth/github/complete', { grant })
}

export function githubConnectedAccount() {
    return http.get('/oauth/github/account')
}

export function connectGithubAccount() {
    return http.post('/oauth/github/connect')
}

export function disconnectGithubAccount() {
    return http.delete('/oauth/github/account')
}

export function oauthComplete(grant) { return http.post('/oauth/complete', { grant }) }

export function oauthBindUser(form) {
    return http.put('/oauth/bindUser', form)
}
