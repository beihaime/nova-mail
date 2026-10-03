import http from '@/axios/index.js'

export const getSessions = () => http.get('/account/sessions')
export const revokeSession = (id) => http.delete(`/account/sessions/${encodeURIComponent(id)}`)
export const revokeOtherSessions = () => http.post('/account/sessions/revoke-others')
export const getLoginAlerts = () => http.get('/account/login-alerts')
export const updateLoginAlerts = (payload) => http.patch('/account/login-alerts', payload)
