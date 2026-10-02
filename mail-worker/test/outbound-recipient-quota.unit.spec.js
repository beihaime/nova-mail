import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ role: vi.fn() }));

vi.mock('../src/service/setting-service', () => ({
	default: { query: vi.fn(async () => ({ send: 1, domainList: ['@example.com'], resendTokens: {} })) },
}));
vi.mock('../src/service/user-service', () => ({
	default: { selectById: vi.fn(async () => ({ userId: 7, email: 'sender@example.com', type: 2, sendCount: 1 })) },
}));
vi.mock('../src/service/role-service', () => ({
	default: { selectById: mocks.role },
}));

import emailService from '../src/service/email-service';

describe('outbound recipient quotas', () => {
	beforeEach(() => {
		mocks.role.mockResolvedValue({ sendCount: 3, sendType: 'count' });
	});

	it('counts To, Cc, and Bcc together before sending', async () => {
		await expect(emailService.send({ env: { admin: 'admin@example.com' } }, {
			accountId: 1,
			receiveEmail: ['to@example.com'],
			cc: ['cc@example.com'],
			bcc: ['bcc@example.com'],
			subject: 'Quota', text: 'body', content: '<p>body</p>', attachments: [],
		}, 7)).rejects.toThrow();
	});

	it('does not let an external Cc or Bcc bypass the internal-only policy', async () => {
		mocks.role.mockResolvedValue({ sendCount: null, sendType: 'internal' });
		await expect(emailService.send({ env: { admin: 'admin@example.com' } }, {
			accountId: 1,
			receiveEmail: ['to@example.com'], cc: ['outside@example.net'], bcc: [],
			subject: 'Internal only', text: 'body', content: '<p>body</p>', attachments: [],
		}, 7)).rejects.toThrow();
	});
});
