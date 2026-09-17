import r2Service from '../service/r2-service';
import orm from '../entity/orm';
import { att } from '../entity/att';
import { and, eq } from 'drizzle-orm';
import app from '../hono/hono';
import { email } from '../entity/email';

export async function servePrivateAttachment(c) {
	const key = c.req.path.split('/oss/')[1];
	const user = c.get('user');
	const notFound = () => new Response('Not found', { status: 404, headers: {
		'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'
	} });
	if (!user?.userId || !key?.startsWith('attachments/')) return notFound();
	const attachment = await orm(c).select({ key: att.key, filename: att.filename, mimeType: att.mimeType })
		.from(att).innerJoin(email, eq(att.emailId, email.emailId)).where(
		and(eq(att.key, key), eq(att.userId, user.userId), eq(email.userId, user.userId))
	).get();

	if (!attachment) {
		return notFound();
	}

	const obj = await r2Service.getObj(c, key);
	if (!obj) {
		return notFound();
	}

	const storedType = attachment.mimeType || obj.httpMetadata?.contentType || obj.headers?.get('Content-Type');
	const safeImages = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']);
	const inline = safeImages.has(storedType?.toLowerCase());
	const filename = (attachment.filename || 'attachment').replace(/[^\x20-\x7e]|["\\/]/g, '_');
	return new Response(obj.body, {
		headers: {
			'Content-Type': inline ? storedType : 'application/octet-stream',
			'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
			'X-Content-Type-Options': 'nosniff',
			'Cache-Control': 'private, no-store'
		}
	});
}

app.get('/oss/*', servePrivateAttachment);
