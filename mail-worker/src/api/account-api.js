import app from '../hono/hono';
import accountService from '../service/account-service';
import senderAddressService from '../service/sender-address-service';
import result from '../model/result';
import userContext from '../security/user-context';
import userPreferencesService from '../service/user-preferences-service';

app.get('/account/preferences', async (c) => {
	return c.json(result.ok(await userPreferencesService.get(c, userContext.getUserId(c))));
});

app.patch('/account/preferences', async (c) => {
	const body = await c.req.json();
	return c.json(result.ok(await userPreferencesService.setDensity(c, userContext.getUserId(c), body?.mailListDensity)));
});

app.get('/account/list', async (c) => {
	const list = await accountService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(list));
});

app.delete('/account/delete', async (c) => {
	await accountService.delete(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.post('/account/add', async (c) => {
	const account = await accountService.add(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(account));
});

app.put('/account/setName', async (c) => {
	await accountService.setName(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/account/setAllReceive', async (c) => {
	await accountService.setAllReceive(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/account/setAsTop', async (c) => {
	await accountService.setAsTop(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

/**
 * Choose which of the caller's own addresses is the default sender.
 *
 * The account id is re-authorized here (ownership, active state, role/domain send
 * permission) instead of trusting the address list the Settings page rendered.
 * A `null`/`0` id clears the preference so the runtime fallback decides.
 */
app.put('/account/setDefaultSender', async (c) => {
	const body = await c.req.json();
	const preference = await senderAddressService.setDefaultSender(
		c, body?.accountId ?? null, userContext.getUserId(c));
	return c.json(result.ok(preference));
});
