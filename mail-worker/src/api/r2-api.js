import r2Service from '../service/r2-service';
import orm from '../entity/orm';
import { att } from '../entity/att';
import { and, eq, or } from 'drizzle-orm';
import app from '../hono/hono';
import email from '../entity/email';
import account from '../entity/account';
import { isDel } from '../const/entity-const';
import constant from '../const/constant';

app.get('/oss/*', async (c) => {
	let key;
	try {
		key = decodeURIComponent(c.req.path.split('/oss/')[1] || '');
	} catch {
		return c.notFound();
	}

	if (!key.startsWith(constant.ATTACHMENT_PREFIX)) {
		return c.notFound();
	}

	const user = c.get('user');
	const attachment = await orm(c).select({ key: att.key }).from(att)
		.innerJoin(email, eq(email.emailId, att.emailId))
		.innerJoin(account, eq(account.accountId, att.accountId))
		.where(
			and(
				eq(att.key, key),
				eq(email.isDel, isDel.NORMAL),
				eq(account.isDel, isDel.NORMAL),
				or(eq(att.userId, user.userId), eq(user.email, c.env.admin))
			)
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
			'Content-Disposition': obj.httpMetadata?.contentDisposition || 'attachment',
			'Cache-Control': 'private, no-store',
			'Cross-Origin-Resource-Policy': 'same-origin'
		}
	});
});
