import r2Service from '../service/r2-service';
import orm from '../entity/orm';
import { att } from '../entity/att';
import { and, eq, or } from 'drizzle-orm';
import app from '../hono/hono';
import account from '../entity/account';
import { isDel } from '../const/entity-const';
import constant from '../const/constant';
import { email } from '../entity/email';

/**
 * Attachment reading.
 *
 * Two routes share the same ownership rules (attachment, mail and account
 * must agree, and the caller owns them or is the administrator):
 *
 *   GET /api/oss/<storage key>   — used by the reader when it inlines images
 *                                  that a mail body references (`{{domain}}…`).
 *                                  Images only, everything else is a download.
 *   GET /api/attachments/<attId> — used by the attachment list's preview and
 *                                  download buttons. Addresses the row by its
 *                                  primary key, so it does not depend on the
 *                                  storage key being parseable, and it serves
 *                                  PDFs inline as well.
 */

// Types safe to render inside the app's origin. SVG is deliberately absent —
// it can execute script — and so is anything unknown, which downloads instead.
const INLINE_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/gif',
	'image/webp',
	'image/avif',
	'image/bmp',
	'application/pdf',
]);

// Fallback for rows (and objects) whose content type was never recorded.
const EXTENSION_TYPES = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	avif: 'image/avif',
	bmp: 'image/bmp',
	pdf: 'application/pdf',
	txt: 'text/plain',
	csv: 'text/csv',
	json: 'application/json',
	zip: 'application/zip',
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xls: 'application/vnd.ms-excel',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function normalizeMime(value) {
	const type = String(value || '').split(';')[0].trim().toLowerCase();
	return /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(type) ? type : '';
}

function mimeFromFilename(filename) {
	const extension = String(filename || '').split('.').pop()?.toLowerCase() || '';
	return EXTENSION_TYPES[extension] || '';
}

/** Header-safe filename: ASCII only, no quotes/slashes/newlines. */
function headerFilename(filename, fallback) {
	const cleaned = String(filename || '').replace(/[^\x20-\x7e]|["\\/\r\n]/g, '_').trim();
	return cleaned || fallback;
}

function notFound() {
	return new Response('Not found', {
		status: 404,
		headers: {
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff',
		},
	});
}

/**
 * The stored mime type wins, then whatever the object store recorded, then the
 * filename extension.
 *
 * Several older rows have no mime type at all, and the object store is no help
 * either: the KV backend always answers `application/octet-stream` when nothing
 * was recorded, so that generic value is treated as "unknown" and the extension
 * decides. Without this a PNG (or PDF) could not be previewed.
 */
function resolveContentType(attachment, obj) {
	const stored = normalizeMime(attachment.mimeType);
	if (stored) return stored;

	const fromObject = normalizeMime(obj.httpMetadata?.contentType)
		|| normalizeMime(obj.headers?.get?.('Content-Type'));

	if (fromObject && fromObject !== 'application/octet-stream') return fromObject;

	return mimeFromFilename(attachment.filename) || fromObject || 'application/octet-stream';
}

function attachmentResponse(attachment, obj) {
	const contentType = resolveContentType(attachment, obj);
	const inline = INLINE_TYPES.has(contentType);
	const filename = headerFilename(attachment.filename, 'attachment');

	return new Response(obj.body, {
		headers: {
			// Only the allowlisted types are echoed back. Anything else — SVG, an
			// active document, an unknown type — is served as a generic download,
			// so a stored file can never execute in the app's origin.
			'Content-Type': inline ? contentType : 'application/octet-stream',
			'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'private, no-store',
			'Cross-Origin-Resource-Policy': 'same-origin',
			'Content-Security-Policy': 'sandbox',
		},
	});
}

function ownerCondition(c, user) {
	return or(
		and(eq(att.userId, user.userId), eq(email.userId, user.userId), eq(account.userId, user.userId)),
		eq(user.email, c.env.admin)
	);
}

/** Storage-key addressed read, kept for the mail body's inline images. */
export async function servePrivateAttachment(c) {
	let key;
	try { key = decodeURIComponent(c.req.path.split('/oss/')[1] || ''); }
	catch { return notFound(); }
	const user = c.get('user');

	if (!user?.userId || !key?.startsWith(constant.ATTACHMENT_PREFIX)) return notFound();

	const attachment = await orm(c).select({ key: att.key, filename: att.filename, mimeType: att.mimeType })
		.from(att)
		.innerJoin(email, and(eq(att.emailId, email.emailId), eq(att.accountId, email.accountId)))
		.innerJoin(account, eq(account.accountId, att.accountId))
		.where(
			and(eq(att.key, key), eq(account.isDel, isDel.NORMAL), ownerCondition(c, user))
		).get();

	if (!attachment) return notFound();

	const obj = await r2Service.getObj(c, key);
	if (!obj) return notFound();

	return attachmentResponse(attachment, obj);
}

/**
 * `attId` addressed read for the attachment list: returns the raw bytes with
 * their real content type, so the reader can turn the response into an object
 * URL and render it in an `<img>` or a PDF `<iframe>`.
 */
export async function serveAttachmentById(c) {
	const attId = Number(c.req.param('id')) || 0;
	const user = c.get('user');

	if (!user?.userId || !Number.isSafeInteger(attId) || attId <= 0) return notFound();

	const attachment = await orm(c).select({ key: att.key, filename: att.filename, mimeType: att.mimeType })
		.from(att)
		.innerJoin(email, and(eq(att.emailId, email.emailId), eq(att.accountId, email.accountId)))
		.innerJoin(account, eq(account.accountId, att.accountId))
		.where(
			and(eq(att.attId, attId), eq(account.isDel, isDel.NORMAL), ownerCondition(c, user))
		).get();

	if (!attachment) return notFound();

	const obj = await r2Service.getObj(c, attachment.key);
	if (!obj) return notFound();

	return attachmentResponse(attachment, obj);
}

app.get('/oss/*', servePrivateAttachment);
app.get('/attachments/:id', serveAttachmentById);
