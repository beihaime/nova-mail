import app from '../hono/hono';
import pushService from '../service/push-service';
import result from '../model/result';
import userContext from '../security/user-context';

/** Public key (or `enabled: false`) the browser needs before subscribing. */
app.get('/push/config', async (c) => {
	return c.json(result.ok(pushService.getConfig(c.env)));
});

/** Store the caller's subscription; the user id comes from the token only. */
app.post('/push/subscribe', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	const data = await pushService.subscribe(c, body, userContext.getUserId(c));
	return c.json(result.ok(data));
});

/** Remove one of the caller's own subscriptions (never another user's). */
app.delete('/push/subscribe', async (c) => {
	const data = await pushService.unsubscribe(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

/** Send a test notification to the caller's own devices (diagnostics). */
app.post('/push/test', async (c) => {
	const data = await pushService.testNotification(c.env, userContext.getUserId(c));
	return c.json(result.ok(data));
});
