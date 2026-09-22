import BizError from '../error/biz-error';

const CONTROL = /[\u0000-\u001F\u007F-\u009F]/u;
const MIME_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

function fail(message) { throw new BizError(message); }

function requireSafeHeader(value, field, { optional = false } = {}) {
	if (value == null && optional) return null;
	if (typeof value !== 'string' || CONTROL.test(value)) fail(`Invalid ${field}`);
	return value;
}

function isMailbox(value) {
	if (typeof value !== 'string' || CONTROL.test(value) || value !== value.trim() || value.length > 254) return false;
	const at = value.lastIndexOf('@');
	if (at < 1 || at !== value.indexOf('@') || at > 64 || at === value.length - 1) return false;
	const local = value.slice(0, at);
	const domain = value.slice(at + 1);
	return !/[\s<>(),;:\\"\[\]]/u.test(local) && !/[\s<>(),;:\\"\[\]]/u.test(domain) && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

export function normalizeAttachmentFilename(filename) {
	if (typeof filename !== 'string' || CONTROL.test(filename)) fail('Invalid attachment filename');
	const normalized = filename.normalize('NFC').split(/[\\/]+/).pop().trim();
	if (!normalized || normalized === '.' || normalized === '..') fail('Invalid attachment filename');
	return normalized;
}

export function normalizeMimeType(value) {
	if (!value) return 'application/octet-stream';
	if (typeof value !== 'string' || CONTROL.test(value)) fail('Invalid attachment MIME type');
	const mimeType = value.trim().toLowerCase();
	if (!MIME_TOKEN.test(mimeType)) fail('Invalid attachment MIME type');
	return mimeType;
}

export function normalizeBase64(value) {
	if (typeof value !== 'string' || !value || CONTROL.test(value)) fail('Invalid attachment content');
	const content = value.startsWith('data:') ? value.slice(value.indexOf(',') + 1) : value;
	if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) fail('Invalid attachment content');
	return content;
}

export function normalizeAttachment(attachment) {
	if (!attachment || typeof attachment !== 'object') fail('Invalid attachment');
	const filename = normalizeAttachmentFilename(attachment.filename || 'attachment');
	const mimeType = normalizeMimeType(attachment.mimeType || attachment.contentType || attachment.type);
	const content = normalizeBase64(attachment.content);
	let contentId = attachment.contentId;
	if (contentId != null) {
		if (typeof contentId !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(contentId.replace(/^<|>$/g, ''))) fail('Invalid attachment content ID');
		contentId = contentId.replace(/^<|>$/g, '');
	}
	return { ...attachment, filename, mimeType, type: mimeType, content, contentId };
}

export function safeMessageId(value) {
	if (typeof value !== 'string' || CONTROL.test(value) || value.length > 998) return null;
	const trimmed = value.trim();
	return /^<[^<>\s]+>$/.test(trimmed) ? trimmed : null;
}

export function validateOutgoingMail(params) {
	if (!params || typeof params !== 'object') fail('Invalid message');
	if (!Array.isArray(params.receiveEmail) || params.receiveEmail.length === 0) fail('Invalid recipient list');
	const receiveEmail = params.receiveEmail.map(address => {
		if (!isMailbox(address)) fail('Invalid recipient address');
		return address;
	});
	const subject = requireSafeHeader(params.subject, 'subject');
	const name = params.name == null || params.name === '' ? null : requireSafeHeader(params.name, 'sender name');
	if (params.text != null && (typeof params.text !== 'string' || params.text.includes('\0'))) fail('Invalid plain-text body');
	if (params.content != null && (typeof params.content !== 'string' || params.content.includes('\0'))) fail('Invalid HTML body');
	if (params.attachments != null && !Array.isArray(params.attachments)) fail('Invalid attachment list');
	return { ...params, receiveEmail, subject, name, text: params.text || '', content: params.content || '', attachments: (params.attachments || []).map(normalizeAttachment) };
}
