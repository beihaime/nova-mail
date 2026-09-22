import BizError from '../error/biz-error';

// These limits stay below common provider and Workers Email constraints while
// still allowing normal document attachments. Archives are never extracted.
export const MAIL_LIMITS = Object.freeze({
	MAX_RAW_INBOUND_BYTES: 25 * 1024 * 1024,
	MAX_OUTBOUND_REQUEST_BYTES: 35 * 1024 * 1024,
	MAX_OUTBOUND_BODY_BYTES: 1024 * 1024,
	MAX_ATTACHMENT_COUNT: 10,
	MAX_ATTACHMENT_BYTES: 10 * 1024 * 1024,
	MAX_TOTAL_ATTACHMENT_BYTES: 25 * 1024 * 1024,
	MAX_SUBJECT_LENGTH: 998,
	MAX_DISPLAY_NAME_LENGTH: 512,
	MAX_FILENAME_LENGTH: 255,
	MAX_MIME_TYPE_LENGTH: 127
});

export function base64DecodedLength(value) {
	const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
	return (value.length / 4) * 3 - padding;
}

export function assertEncodedAttachmentLimit(content) {
	// Check encoded input before atob()/Uint8Array allocation.
	const maximum = Math.ceil(MAIL_LIMITS.MAX_ATTACHMENT_BYTES / 3) * 4;
	if (content.length > maximum || base64DecodedLength(content) > MAIL_LIMITS.MAX_ATTACHMENT_BYTES) throw new BizError('Attachment exceeds the size limit');
}

export function assertAttachmentLimits(attachments = []) {
	if (attachments.length > MAIL_LIMITS.MAX_ATTACHMENT_COUNT) throw new BizError('Too many attachments');
	let total = 0;
	for (const attachment of attachments) {
		const bytes = typeof attachment.content === 'string'
			? base64DecodedLength(attachment.content)
			: attachment.content?.byteLength ?? attachment.content?.length ?? 0;
		if (!Number.isFinite(bytes) || bytes < 0 || bytes > MAIL_LIMITS.MAX_ATTACHMENT_BYTES) throw new BizError('Attachment exceeds the size limit');
		total += bytes;
		if (total > MAIL_LIMITS.MAX_TOTAL_ATTACHMENT_BYTES) throw new BizError('Total attachment size exceeds the limit');
	}
}

export function assertOutboundMailLimits(message) {
	const bodyBytes = new TextEncoder().encode(`${message.text || ''}${message.content || ''}`).byteLength;
	if (bodyBytes > MAIL_LIMITS.MAX_OUTBOUND_BODY_BYTES) throw new BizError('Message body exceeds the size limit');
	assertAttachmentLimits(message.attachments);
}

export async function readLimitedJson(c, maximum = MAIL_LIMITS.MAX_OUTBOUND_REQUEST_BYTES) {
	const declared = Number(c.req.header('Content-Length'));
	if (Number.isFinite(declared) && declared > maximum) throw new BizError('Request payload exceeds the size limit');
	const reader = c.req.raw.body?.getReader();
	if (!reader) throw new BizError('Invalid request payload');
	let size = 0;
	const chunks = [];
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maximum) {
				await reader.cancel();
				throw new BizError('Request payload exceeds the size limit');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const output = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
	try { return JSON.parse(new TextDecoder().decode(output)); }
	catch { throw new BizError('Invalid request payload'); }
}
