import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resendSend: vi.fn() }));

vi.mock('resend', () => ({
	Resend: class {
		constructor() { this.emails = { send: mocks.resendSend }; }
	},
}));

import emailService from '../src/service/email-service';

describe('outbound Cc/Bcc provider payloads', () => {
	it('keeps To-only Resend payloads unchanged', async () => {
		mocks.resendSend.mockResolvedValue({ data: { id: 'to-only' } });
		await emailService.sendByResend('token', {
			name: 'Nova', accountEmail: 'sender@example.com', receiveEmail: ['to@example.net'],
			subject: 'To only', text: 'body', html: '<p>body</p>', attachments: [],
		});
		const payload = mocks.resendSend.mock.calls.at(-1)[0];
		expect(payload.to).toEqual(['to@example.net']);
		expect(payload).not.toHaveProperty('cc');
		expect(payload).not.toHaveProperty('bcc');
	});

	it('adds Cc and Bcc only when supplied', async () => {
		mocks.resendSend.mockResolvedValue({ data: { id: 'cc-bcc' } });
		await emailService.sendByResend('token', {
			name: 'Nova', accountEmail: 'sender@example.com', receiveEmail: ['to@example.net'],
			cc: ['cc@example.net'], bcc: ['bcc@example.net'],
			subject: 'Recipients', text: 'body', html: '<p>body</p>', attachments: [],
		});
		expect(mocks.resendSend.mock.calls.at(-1)[0]).toMatchObject({
			to: ['to@example.net'], cc: ['cc@example.net'], bcc: ['bcc@example.net'],
		});
	});
});
