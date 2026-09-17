import http from '@/axios/index.js';

export function oauthLinuxDoLogin(code, redirectUri) {
    return http.post('/oauth/linuxDo/login',{code, redirectUri})
}

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

export function googleOauthComplete(grant) {
    return http.post('/oauth/google/complete', { grant })
}

export function googleConnectedAccount() {
    return http.get('/oauth/google/account')
}

export function connectGoogleAccount() {
    return http.post('/oauth/google/connect')
}

export function disconnectGoogleAccount() {
    return http.delete('/oauth/google/account')
}

export function oauthBindUser(form) {
    return http.put('/oauth/bindUser', form)
}
