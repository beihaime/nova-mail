import app from '../hono/hono';
import userContext from '../security/user-context';
import brandAvatarService from '../service/brand-avatar-service';

app.get('/email/brand-avatar', async (c) => {
	const emailId = Number(c.req.query('emailId'));
	if (!Number.isSafeInteger(emailId) || emailId <= 0) return c.body(null, 404);
	return brandAvatarService.response(c, emailId, userContext.getUserId(c));
});
