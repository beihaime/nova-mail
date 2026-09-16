import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';

function resolveCorsOrigin(c, origin) {
	// Same-origin / non-browser requests
	if (!origin) return '*';

	const allowed = [];

	const pushHost = (host) => {
		if (!host || typeof host !== 'string') return;
		const h = host.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
		if (!h) return;
		allowed.push(`https://${h}`);
		allowed.push(`http://${h}`);
	};

	pushHost(c.env.TURNSTILE_HOSTNAME);
	pushHost(c.env.CORS_ORIGIN);

	if (typeof c.env.CORS_ORIGINS === 'string' && c.env.CORS_ORIGINS) {
		try {
			const list = JSON.parse(c.env.CORS_ORIGINS);
			if (Array.isArray(list)) list.forEach(pushHost);
		} catch {
			c.env.CORS_ORIGINS.split(',').forEach(pushHost);
		}
	}

	if (allowed.length === 0) {
		// No host configured yet — keep permissive for first-time setup
		return origin;
	}

	return allowed.includes(origin) ? origin : allowed[0];
}

app.use('*', async (c, next) => {
	const middleware = cors({
		origin: (origin) => resolveCorsOrigin(c, origin),
		allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
		allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		maxAge: 86400
	});
	return middleware(c, next);
});

app.onError((err, c) => {
	if (err.name === 'BizError') {
		console.log(err.message);
	} else {
		console.error(err);
	}

	if (err.message === `Cannot read properties of undefined (reading 'get')`) {
		return c.json(result.fail('KV数据库未绑定<br/>KV database not bound',502));
	}

	if (err.message === `Cannot read properties of undefined (reading 'put')`) {
		return c.json(result.fail('KV数据库未绑定<br/>KV database not bound',502));
	}

	if (err.message === `Cannot read properties of undefined (reading 'prepare')`) {
		return c.json(result.fail('D1数据库未绑定<br/>D1 database not bound',502));
	}

	if (err.message?.includes('D1_ERROR: no such column')) {
		return c.json(result.fail('请按照文档更新数据库<br/>Please update the database as documented',502));
	}

	return c.json(result.fail(err.message, err.code));
});

export default app;
