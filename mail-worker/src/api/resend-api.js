import resendService from '../service/resend-service';
import app from '../hono/hono';
app.post('/webhooks',async (c) => {
	try {
		const body = await c.req.text();
		const event = await resendService.verifyWebhook(c, body);
		await resendService.webhooks(c, event);
		return c.text('success', 200)
	} catch (e) {
		console.warn('Rejected Resend webhook:', e.message);
		return c.text('Invalid webhook', 400)
	}
})
