import http from '@/axios/index.js';

/**
 * One page of the message list.
 *
 * `archived` selects the view: 0 is the Inbox (and every other folder), 1 is the
 * Archive. The server filters on the flag, so the two never mix.
 */
export function emailList(accountId, allReceive, emailId, timeSort, size, type, full, keyword = '', archived = 0) {
    return http.get('/email/list', {params: {accountId, allReceive, emailId, timeSort, size, type, full, keyword, archived}})
}

export function emailDelete(emailIds) {
    return http.delete('/email/delete?emailIds=' + emailIds)
}

/**
 * Mobile swipe actions. `archive` takes a message out of the Inbox without
 * deleting it; `unarchive` and `restore` are the undo paths the snackbar uses.
 * The server scopes all three to messages the caller owns.
 */
export function emailArchive(emailIds) {
    return http.put('/email/archive', {emailIds})
}

export function emailUnarchive(emailIds) {
    return http.put('/email/unarchive', {emailIds})
}

export function emailRestore(emailIds) {
    return http.put('/email/restore', {emailIds})
}

export function emailLatest(emailId, accountId, allReceive) {
    return http.get('/email/latest', {params: {emailId, accountId, allReceive}, noMsg: true, timeout: 35 * 1000})
}

/**
 * Whole conversation of the message. The Inbox only returns the newest message
 * per thread, so the reader uses this to load the original + every reply.
 */
export function emailThread(emailId, accountId, allReceive) {
    return http.get('/email/thread', {params: {emailId, accountId, allReceive}, noMsg: true})
}

export function emailRead(emailIds) {
    return http.put('/email/read', {emailIds})
}

export function emailSend(form,progress) {
    return http.post('/email/send', form,{
        onUploadProgress: (e) => {
            progress(e)
        },
        noMsg: true
    })
}
