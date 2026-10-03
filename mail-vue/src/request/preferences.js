import http from '@/axios/index.js'

export const getMailPreferences = () => http.get('/account/preferences')
export const setMailListDensity = (mailListDensity) => http.patch('/account/preferences', { mailListDensity })
