import axios from "axios";
import router from "@/router";
import i18n from "@/i18n/index.js";
import {useSettingStore} from "@/store/setting.js";
import {clearAuthenticatedSession, isLogoutInProgress} from '@/utils/session-state.js';

const currentAuthorization = () => `${localStorage.getItem('token')}`
const isLogoutRequest = config => Boolean(config?.isLogoutRequest)
const isStaleRequest = config => Boolean(config) && !isLogoutRequest(config) && config.headers?.Authorization !== currentAuthorization()
const isExpectedLogoutAuthFailure = config => !isLogoutRequest(config) && Boolean(config?.suppressAuthError)

let http = axios.create({
    baseURL: import.meta.env.VITE_BASE_URL
});

http.interceptors.request.use(config => {
    const { lang } = useSettingStore();
    // Logout clears local storage before making its request, but it must still
    // carry the token being revoked. No other request may opt into this.
    config.headers.Authorization = config.logoutToken || currentAuthorization()
    // Persist this decision on the request. It may complete after navigation
    // and after the logout flag has been reset, but its 401 is still expected.
    if (!isLogoutRequest(config) && isLogoutInProgress()) config.suppressAuthError = true
    config.headers['accept-language'] = lang
    return config
})

http.interceptors.response.use((res) => {
		// A response started under a previous identity must not populate current stores.
		if (isStaleRequest(res.config)) return Promise.reject(new Error('Session changed'))
		if (res.config.responseType === 'blob') {
			return res.data
		}

        return new Promise((resolve, reject) => {

            const noMsg = res.config.noMsg;
            const data = res.data

            if (data.code === 401) {
                if (isExpectedLogoutAuthFailure(res.config)) return reject(data)
                if (!noMsg) ElMessage({
                    message: data.message,
                    type: 'error',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                clearAuthenticatedSession()
                router.replace('/login')
                reject(data)
            } else if (noMsg) {

                data.code === 200 ? resolve(data.data) : reject(data)
            } else if (data.code === 403) {
                ElMessage({
                    message: data.message,
                    type: 'warning',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                reject(data)

            } else if (data.code === 429) {
                ElMessage({
                    message: data.message || i18n.global.t('tooManyRequests'),
                    type: 'warning',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                reject(data)

            } else if (data.code === 502) {
                ElMessage({
                    dangerouslyUseHTMLString: true,
                    message: data.message,
                    type: 'error',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                reject(data)
            } else if (data.code !== 200) {
                ElMessage({
                    message: data.message,
                    type: 'error',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                reject(data)
            }
            resolve(data.data)
        })
    },
    (error) => {

        if (isStaleRequest(error.config)) return Promise.reject(error)
        if (error.response?.status === 401) {
            if (isExpectedLogoutAuthFailure(error.config)) return Promise.reject(error)
            clearAuthenticatedSession()
            router.replace('/login')
            return Promise.reject(error)
        }

        if (error.status === 429) {
            ElMessage({
                message: (error.response && error.response.data && error.response.data.message) || i18n.global.t('tooManyRequests'),
                type: 'warning',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
            return Promise.reject(error)
        }

        if (error.status === 403) {
            location.reload();
            return;
        }

        const noMsg = error.config.noMsg;

        if (noMsg) {
            return Promise.reject(error)
        } else if (error.message.includes('Network Error')) {
            ElMessage({
                message: i18n.global.t('networkErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
        } else if (error.code === 'ECONNABORTED') {
            ElMessage({
                message: i18n.global.t('timeoutErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true
            })
            ElMessage.error('')
        } else if (error.response) {
            ElMessage({
                message: i18n.global.t('serverBusyErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
        } else {
            ElMessage({
                message: i18n.global.t('reqFailErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
        }
        return Promise.reject(error)
    })

export default http
