import app from '../hono/hono';
import emailService from '../service/email-service';
import result from '../model/result';
import userContext from '../security/user-context';
import attService from '../service/att-service';
import { readLimitedJson } from '../const/mail-limits';

app.get('/email/list', async (c) => {
	const data = await emailService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.get('/email/latest', async (c) => {
	const list = await emailService.latest(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(list));
});

// Whole conversation of the anchor message (Inbox rows are one per thread).
app.get('/email/thread', async (c) => {
	const data = await emailService.thread(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.delete('/email/delete', async (c) => {
	const data = await emailService.moveToTrash(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(data));
});

app.delete('/email/trash/delete', async (c) => {
	await emailService.deleteForever(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.delete('/email/trash/empty', async (c) => {
	await emailService.emptyTrash(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok());
});

// Mobile swipe actions. Archive hides a message from the Inbox without deleting
// it; unarchive and restore are the undo paths the snackbar calls.
app.put('/email/archive', async (c) => {
	await emailService.archive(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.put('/email/unarchive', async (c) => {
	await emailService.unarchive(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.put('/email/restore', async (c) => {
	await emailService.restoreFromTrash(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})

app.get('/email/attList', async (c) => {
	const attList = await attService.list(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok(attList));
});

app.post('/email/send', async (c) => {
	const email = await emailService.send(c, await readLimitedJson(c), userContext.getUserId(c));
	return c.json(result.ok(email));
});

app.put('/email/read', async (c) => {
	await emailService.read(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
})
