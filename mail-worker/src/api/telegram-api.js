import app from '../hono/hono';
import telegramService from '../service/telegram-service';

app.get('/telegram/getEmail/:token', async (c) => {
	const content = await telegramService.getEmailContent(c, c.req.param());
	// Preview links are bearer capabilities. Do not let a browser or intermediary
	// retain email content after the short-lived link has expired.
	c.header('Cache-Control', 'private, no-store');
	c.header('Content-Security-Policy', "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; media-src 'none'; object-src 'none'; style-src 'unsafe-inline'");
	c.header('X-Content-Type-Options', 'nosniff');
	c.header('X-Frame-Options', 'DENY');
	c.header('Referrer-Policy', 'no-referrer');
	return c.html(content)
});
