import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import pushService from '../src/service/push-service';
import { generateVapidKeys } from '../src/lib/web-push';
import { createSubscription, decryptPayload, verifyVapidHeader } from './helpers/web-push-ua';

/**
 * Delivery-level tests for Web Push.
 *
 * D1 and `fetch` are the only collaborators, so both are stubbed: the assertions
 * are about *what leaves the Worker* — a signed, encrypted, minimal payload —
 * and about a mail path that must never fail because a device went away.
 */

const state = vi.hoisted(() => ({
	rows: [],
	selectError: null,
}));

vi.mock('../src/entity/orm', () => ({
	default: () => ({
		select: () => ({
			from: () => ({
				where: () => ({
					all: async () => {
						if (state.selectError) throw state.selectError;
						return state.rows;
					},
				}),
			}),
		}),
		delete: () => ({ where: () => ({ run: async () => ({ meta: { changes: 1 } }) }) }),
	}),
}));

const fetchCalls = [];

beforeEach(() => {
	state.rows = [];
	state.selectError = null;
	fetchCalls.length = 0;
	globalThis.fetch = vi.fn(async (url, init) => {
		fetchCalls.push({ url, init });
		return new Response('', { status: 201 });
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

async function vapidEnv(overrides = {}) {
	const keys = await generateVapidKeys();
	return {
		vapid_public_key: keys.publicKey,
		vapid_private_key: keys.privateKey,
		vapid_subject: 'mailto:admin@beihaime.com',
		...overrides,
	};
}

describe('push configuration', () => {
	it('stays disabled without VAPID secrets', () => {
		expect(pushService.getConfig({})).toEqual({ enabled: false, publicKey: '' });
		expect(pushService.getConfig({ vapid_public_key: 'nope', vapid_private_key: 'nope' })).toEqual({
			enabled: false,
			publicKey: '',
		});
	});

	it('advertises only the public key once configured', async () => {
		const env = await vapidEnv();
		const config = pushService.getConfig(env);

		expect(config.enabled).toBe(true);
		expect(config.publicKey).toBe(env.vapid_public_key);
		expect(config.privateKey).toBeUndefined();
	});
});

describe('notifyNewMail', () => {
	it('does nothing at all when push is not configured', async () => {
		const result = await pushService.notifyNewMail({}, 7, { emailId: 1, from: 'a@b.c', subject: 'x' });

		expect(result).toEqual({ sent: 0 });
		expect(fetchCalls).toHaveLength(0);
	});

	it('does nothing for a message with no owner', async () => {
		const env = await vapidEnv();
		expect(await pushService.notifyNewMail(env, 0, { emailId: 1 })).toEqual({ sent: 0 });
		expect(fetchCalls).toHaveLength(0);
	});

	it('sends a signed, encrypted, minimal payload to every device', async () => {
		const env = await vapidEnv();
		const desktop = await createSubscription();
		const phone = await createSubscription();

		state.rows = [
			{ id: 1, endpoint: 'https://fcm.googleapis.com/fcm/send/desktop', p256dh: desktop.p256dh, auth: desktop.auth },
			{ id: 2, endpoint: 'https://fcm.googleapis.com/fcm/send/phone', p256dh: phone.p256dh, auth: phone.auth },
		];

		const result = await pushService.notifyNewMail(env, 7, {
			emailId: 123,
			from: 'dev@beihaime.com',
			subject: 'Re: Prompt',
		});

		expect(result).toEqual({ sent: 2 });
		expect(fetchCalls).toHaveLength(2);

		for (const call of fetchCalls) {
			// POST with the aes128gcm content encoding and a VAPID token.
			expect(call.init.method).toBe('POST');
			expect(call.init.headers['Content-Encoding']).toBe('aes128gcm');
			expect(call.init.headers['Content-Type']).toBe('application/octet-stream');

			const vapid = await verifyVapidHeader(call.init.headers.Authorization);
			expect(vapid.valid).toBe(true);
			expect(vapid.publicKey).toBe(env.vapid_public_key);
			expect(vapid.claims.aud).toBe('https://fcm.googleapis.com');
			expect(vapid.claims.sub).toBe('mailto:admin@beihaime.com');
		}

		// The browser can decrypt it, and it carries no message body.
		const payload = JSON.parse(await decryptPayload(fetchCalls[0].init.body, desktop));
		expect(payload).toEqual({
			title: 'Nova Mail',
			body: '收到来自 dev@beihaime.com 的邮件',
			subject: 'Re: Prompt',
			url: 'mail?emailId=123',
			emailId: 123,
		});

		const serialized = JSON.stringify(payload).toLowerCase();
		for (const forbidden of ['content', 'html', 'text', 'preview', 'bodyhtml', 'recipient']) {
			expect(serialized).not.toContain(forbidden);
		}
	});

	it('drops a subscription the push service reports as gone', async () => {
		const env = await vapidEnv();
		const subscription = await createSubscription();
		const endpoint = 'https://fcm.googleapis.com/fcm/send/dead';

		state.rows = [{ id: 9, endpoint, p256dh: subscription.p256dh, auth: subscription.auth }];

		globalThis.fetch = vi.fn(async () => new Response('', { status: 410 }));
		const removeSpy = vi.spyOn(pushService, 'removeByEndpoint').mockResolvedValue(undefined);

		const result = await pushService.notifyNewMail(env, 7, { emailId: 5, from: 'a@b.c', subject: 's' });

		expect(result).toEqual({ sent: 0 });
		expect(removeSpy).toHaveBeenCalledWith(env, endpoint);
	});

	it('survives a failing push service without throwing', async () => {
		const env = await vapidEnv();
		const subscription = await createSubscription();
		state.rows = [{ id: 3, endpoint: 'https://push.example/x', p256dh: subscription.p256dh, auth: subscription.auth }];

		globalThis.fetch = vi.fn(async () => { throw new Error('network down') });

		await expect(pushService.notifyNewMail(env, 7, { emailId: 1, from: 'a@b.c', subject: 's' }))
			.resolves.toEqual({ sent: 0 });
	});

	it('survives a database failure while loading subscriptions', async () => {
		const env = await vapidEnv();
		state.selectError = new Error('d1 unavailable');

		await expect(pushService.notifyNewMail(env, 7, { emailId: 1, from: 'a@b.c', subject: 's' }))
			.resolves.toEqual({ sent: 0 });
		expect(fetchCalls).toHaveLength(0);
	});
});
