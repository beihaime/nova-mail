import app from '../hono/hono';
import result from "../model/result";
import oauthService from "../service/oauth-service";
import githubOauthService from "../service/github-oauth-service";
import userContext from '../security/user-context';

app.get('/oauth/linuxdo/login', async (c) => {
	return c.redirect(await oauthService.startLogin(c, 'linuxdo'));
});

app.get('/oauth/linuxdo/callback', async (c) => {
	return c.redirect(await oauthService.handleCallback(c, 'linuxdo'));
});

app.get('/oauth/github/login', async (c) => {
	return c.redirect(await githubOauthService.startLogin(c));
});

app.get('/oauth/github/callback', async (c) => {
	return c.redirect(await githubOauthService.handleCallback(c));
});

app.post('/oauth/github/complete', async (c) => {
	const { grant } = await c.req.json();
	return c.json(result.ok(await githubOauthService.completeLogin(c, grant)));
});

app.get('/oauth/github/account', async (c) => {
	return c.json(result.ok(await githubOauthService.getConnectedAccount(c, userContext.getUserId(c))));
});

app.post('/oauth/github/connect', async (c) => {
	const userId = userContext.getUserId(c);
	const sessionToken = await userContext.getToken(c);
	return c.json(result.ok({ authorizeUrl: await githubOauthService.startLink(c, userId, sessionToken) }));
});

app.delete('/oauth/github/account', async (c) => {
	await githubOauthService.disconnect(c, userContext.getUserId(c));
	return c.json(result.ok());
});

app.get('/oauth/google/login', async (c) => {
	return c.redirect(await oauthService.startLogin(c, 'google'));
});

app.get('/oauth/google/callback', async (c) => {
	return c.redirect(await oauthService.handleCallback(c, 'google'));
});

app.post('/oauth/complete', async (c) => {
	const { grant } = await c.req.json();
	return c.json(result.ok(await oauthService.completeLogin(c, grant)));
});

app.post('/oauth/google/connect', async (c) => {
	const userId = userContext.getUserId(c);
	return c.json(result.ok({ authorizeUrl: await oauthService.startLink(c, 'google', userId, await userContext.getToken(c)) }));
});

app.post('/oauth/linuxdo/connect', async (c) => {
	const userId = userContext.getUserId(c);
	return c.json(result.ok({ authorizeUrl: await oauthService.startLink(c, 'linuxdo', userId, await userContext.getToken(c)) }));
});

app.put('/oauth/bindUser', async (c) => {
	// This legacy endpoint used to be public and could bind an OAuth identity
	// without an authenticated Nova Mail session. It is intentionally retired.
	throw new Error('Legacy OAuth binding is no longer supported. Sign in and use Connected accounts.');
})
