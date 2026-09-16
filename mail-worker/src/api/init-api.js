import app from '../hono/hono';
import { dbInit } from '../init/init';

app.get('/init/:secret', (c) => {
	const secret = c.req.param('secret');
	const expected = c.env.jwt_secret;

	if (!expected || String(expected).length < 32) {
		return c.text('JWT secret must be configured and at least 32 characters', 400);
	}

	if (secret !== expected) {
		return c.text('JWT secret mismatch', 403);
	}

	return dbInit.init(c);
})
