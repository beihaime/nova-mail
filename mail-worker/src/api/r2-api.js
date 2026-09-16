import r2Service from '../service/r2-service';
import orm from '../entity/orm';
import { att } from '../entity/att';
import { and, eq } from 'drizzle-orm';
import app from '../hono/hono';

app.get('/oss/*', async (c) => {
	const key = c.req.path.split('/oss/')[1];
	const user = c.get('user');
	const attachment = await orm(c).select({ key: att.key }).from(att).where(
		and(eq(att.key, key), eq(att.userId, user.userId))
	).get();

	if (!attachment) {
		return c.notFound();
	}

	const obj = await r2Service.getObj(c, key);
	if (!obj) {
		return c.notFound();
	}

	return new Response(obj.body, {
		headers: {
			'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
			'Content-Disposition': obj.httpMetadata?.contentDisposition || null
		}
	});
});

