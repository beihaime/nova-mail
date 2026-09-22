import app from '../hono/hono';
import { dbInit } from '../init/init';
import { runBootstrap } from '../init/bootstrap';

app.post('/bootstrap', async (c) => {
	c.header('Cache-Control', 'no-store');
	return runBootstrap(c, (context) => dbInit.init(context));
});
