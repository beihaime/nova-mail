import { afterEach, describe, expect, it, vi } from 'vitest';
import urlSafety from '../src/utils/url-safety';
import webhookService from '../src/service/webhook-service';

const rejectedUrls = [
	'https://127.0.0.1/',
	'https://10.0.0.1/',
	'https://172.16.0.1/',
	'https://192.168.1.1/',
	'https://169.254.169.254/',
	'https://[::1]/',
	'https://[::]/',
	'https://[fe80::1]/',
	'https://[fe81::1]/',
	'https://[::ffff:127.0.0.1]/',
	'https://[::ffff:10.0.0.1]/',
	'https://localhost/',
	'https://localhost./',
	'https://metadata.google.internal./',
	'http://public.example/'
];

describe('webhook destination validation', () => {
	it('allows a normal public HTTPS hostname', () => {
		expect(urlSafety.assertSafeWebhookUrl('https://Webhook.Example/path')).toBe('https://webhook.example/path');
	});

	it.each(rejectedUrls)('rejects unsafe webhook URL %s', (url) => {
		expect(() => urlSafety.assertSafeWebhookUrl(url)).toThrow();
	});

	it('normalizes numeric IPv4 syntax before applying private-range policy', () => {
		for (const url of ['https://2130706433/', 'https://0x7f000001/', 'https://0177.0.0.1/']) {
			expect(() => urlSafety.assertSafeWebhookUrl(url)).toThrow();
		}
	});

	it('does not follow redirects or forward the webhook Authorization header', async () => {
		const fetchMock = vi.fn(async () => new Response('', {
			status: 302,
			headers: { Location: 'https://127.0.0.1/' }
		}));
		vi.stubGlobal('fetch', fetchMock);

		await webhookService.sendEmail({ env: {} }, {
			emailId: 1,
			sendEmail: 'sender@example.com',
			toEmail: 'recipient@example.com',
			subject: 'subject'
		}, 'https://webhook.example/', 0, 'Bearer secret');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe('https://webhook.example/');
		expect(fetchMock.mock.calls[0][1]).toMatchObject({
			redirect: 'manual',
			headers: { Authorization: 'Bearer secret' }
		});
	});
});

afterEach(() => vi.unstubAllGlobals());
