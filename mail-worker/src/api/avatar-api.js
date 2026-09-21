import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import senderAvatarService from '../service/sender-avatar-service';

/**
 * Authenticated sender-avatar metadata.
 *
 * `GET /api/avatar?email=…&emailId=…&exclude=…`
 *
 * The `emailId` (when it belongs to the caller) supplies the message's BIMI
 * selector and authentication results. `exclude` is used by the client when an
 * image failed to load and it wants the next level of the fallback chain.
 */
app.get('/avatar', async (c) => {
	const avatar = await senderAvatarService.metadata(c, {
		email: c.req.query('email'),
		emailId: c.req.query('emailId'),
		name: c.req.query('name'),
		exclude: c.req.query('exclude'),
		userId: userContext.getUserId(c)
	});
	return c.json(result.ok(avatar));
});

/**
 * Public, capability-signed image proxy.
 *
 * The `id` is an HMAC-signed descriptor minted by `GET /avatar`; only ids this
 * Worker issued can be requested, and the descriptor is re-validated before any
 * outbound fetch. It is public so a plain `<img src>` (which cannot carry the
 * bearer token) can render it without the client having to fetch blobs.
 */
app.get('/avatar/image', async (c) => {
	return senderAvatarService.image(c, c.req.query('id'));
});
