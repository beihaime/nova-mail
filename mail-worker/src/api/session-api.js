import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import sessionService from '../service/session-service';

app.get('/account/sessions', async (c) => {
  const userId = userContext.getUserId(c);
  return c.json(result.ok(await sessionService.list(c, userId, c.get('session')?.session_id)));
});

app.delete('/account/sessions/:id', async (c) => {
  const userId = userContext.getUserId(c);
  await sessionService.revoke(c, userId, c.req.param('id'), c.get('session')?.session_id);
  return c.json(result.ok());
});

app.post('/account/sessions/revoke-others', async (c) => {
  const userId = userContext.getUserId(c);
  await sessionService.revokeOthers(c, userId, c.get('session')?.session_id);
  return c.json(result.ok());
});

app.get('/account/login-alerts', async (c) => {
  return c.json(result.ok(await sessionService.alerts(c, userContext.getUserId(c))));
});

app.patch('/account/login-alerts', async (c) => {
  const body = await c.req.json();
  return c.json(result.ok(await sessionService.updateAlerts(c, userContext.getUserId(c), body || {})));
});
