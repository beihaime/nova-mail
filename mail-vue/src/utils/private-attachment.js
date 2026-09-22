import http from '@/axios/index.js';

function attachmentPath(key) {
    return '/oss/' + String(key).split('/').map(encodeURIComponent).join('/');
}

export async function fetchPrivateAttachmentUrl(key) {
    const blob = await http.get(attachmentPath(key), { responseType: 'blob', noMsg: true });
    return URL.createObjectURL(blob);
}

export async function downloadPrivateAttachment(key, filename) {
    const url = await fetchPrivateAttachmentUrl(key);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'attachment';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
