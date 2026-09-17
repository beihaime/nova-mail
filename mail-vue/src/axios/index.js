import axios from "axios";
import router from "@/router";
import {ElMessage} from "element-plus";
import i18n from '@/i18n';

const http = {}

const service = axios.create({
    timeout: 60000
})

service.interceptors.request.use(config => {
    config.headers.Authorization = localStorage.getItem('token')
    return config
}, error => {
    console.log(error)
    return Promise.reject(error);
})

service.interceptors.response.use(
    response => {

        return new Promise((resolve, reject) => {

            const res = response
            const noMsg = res.config.noMsg;
            const data = res.data

            if (noMsg) {

                data.code === 200 ? resolve(data.data) : reject(data)

            } else if (data.code === 401) {
                ElMessage({
                    message: data.message,
                    type: 'error',
                    plain: true,
                    grouping: true,
                    repeatNum: -4,
                })
                localStorage.removeItem('token')
                router.replace('/login')
                reject(data)
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
                    type: 'warning',
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
            }  else {
                resolve(data.data)
            }

        })

    },

    error => {

        console.log(error)

        if (error.status === 429) {
            ElMessage({
                message: (error.response && error.response.data && error.response.data.message) || i18n.global.t('tooManyRequests'),
                type: 'warning',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
        } else if (error.status === 403) {
            ElMessage({
                message: i18n.global.t('permissionAlertMsg'),
                type: 'warning',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
        } else if (error.message.includes('Network Error')) {
            ElMessage({
                message: i18n.global.t('networkErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
        } else if (error.message.includes('timeout')) {
            ElMessage({
                message: i18n.global.t('timeoutErrorMsg'),
                type: 'error',
                plain: true,
                grouping: true,
                repeatNum: -4,
            })
        } else if (error.message.includes('Request failed with status code')) {
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
