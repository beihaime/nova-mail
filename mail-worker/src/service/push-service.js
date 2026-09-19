import orm from '../entity/orm';
import pushSubscription from '../entity/push-subscription';
import { and, asc, eq } from 'drizzle-orm';
import { t } from '../i18n/i18n';
import BizError from '../error/biz-error';
import {
	buildVapidAuthorization,
	encryptPayload,
	hasVapidKeys,
} from '../lib/web-push';

/**
 * Web Push delivery.
 *
 * Subscriptions are per browser and per user, and are only ever read/written
 * through the authenticated user id — an endpoint is never exposed back to the
 * client, and a push payload carries the sender and subject only.
 *
 * The feature stays completely inert (config reports `enabled: false`, nothing
 * is sent) until the three VAPID secrets are configured, so a deployment
 * without them behaves exactly as before.
 */

// A push service wants the payload small; the notification body is tiny anyway.
const MAX_TITLE_LENGTH = 80;
const MAX_SUBJECT_LENGTH = 140;
const MAX_SUBSCRIPTIONS = 20;

function vapidConfig(env) {
	const publicKey = String(env?.vapid_public_key || '').trim();
	const privateKey = String(env?.vapid_private_key || '').trim();
	const subject = String(env?.vapid_subject || '').trim() || 'mailto:admin@example.com';

	if (!hasVapidKeys(publicKey, privateKey)) return null;
	return { publicKey, privateKey, subject };
}

function clean(value, max) {
	return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** SQLite's CURRENT_TIMESTAMP shape, so the column stays comparable. */
function nowSql() {
	return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

const pushService = {

	/** What the browser needs to subscribe: the public key, or "not configured". */
	getConfig(env) {
		const vapid = vapidConfig(env);
		return {
			enabled: Boolean(vapid),
			publicKey: vapid ? vapid.publicKey : '',
		};
	},

	/**
	 * Store (or refresh) the caller's subscription.
	 *
	 * The endpoint is the identity of a browser subscription, so it is upserted:
	 * the same device re-subscribing — or another account signing in on it —
	 * updates the existing row rather than accumulating duplicates.
	 */
	async subscribe(c, params, userId) {
		const endpoint = String(params?.endpoint || '').trim();
		const p256dh = String(params?.keys?.p256dh || '').trim();
		const auth = String(params?.keys?.auth || '').trim();
		const userAgent = clean(params?.userAgent, 200);

		if (!endpoint || !p256dh || !auth) {
			throw new BizError(t('pushSubscriptionInvalid'));
		}

		// Only http(s) push endpoints are acceptable; never fetch a local address.
		let parsed;
		try {
			parsed = new URL(endpoint);
		} catch {
			throw new BizError(t('pushSubscriptionInvalid'));
		}
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
			throw new BizError(t('pushSubscriptionInvalid'));
		}

		// Atomic upsert on the unique endpoint: re-subscribing from the same
		// browser refreshes the row (and re-homes it to the signed-in user)
		// instead of duplicating it, and two concurrent tabs cannot trip the
		// unique index.
		await orm(c).insert(pushSubscription).values({
			userId,
			endpoint,
			p256dh,
			auth,
			userAgent,
		}).onConflictDoUpdate({
			target: pushSubscription.endpoint,
			set: { userId, p256dh, auth, userAgent, updatedAt: nowSql() },
		}).run();

		// Bound the rows one account can hold, oldest first.
		const rows = await orm(c)
			.select({ id: pushSubscription.id })
			.from(pushSubscription)
			.where(eq(pushSubscription.userId, userId))
			.orderBy(asc(pushSubscription.id))
			.all();

		if (rows.length > MAX_SUBSCRIPTIONS) {
			const stale = rows.slice(0, rows.length - MAX_SUBSCRIPTIONS).map(row => row.id);
			for (const id of stale) {
				await orm(c).delete(pushSubscription).where(
					and(eq(pushSubscription.id, id), eq(pushSubscription.userId, userId))
				).run();
			}
		}

		return { subscribed: true };
	},

	/** Remove one of the caller's own subscriptions. */
	async unsubscribe(c, params, userId) {
		const endpoint = String(params?.endpoint || '').trim();
		if (!endpoint) return { removed: 0 };

		const result = await orm(c).delete(pushSubscription).where(
			and(
				eq(pushSubscription.endpoint, endpoint),
				// Never let one account drop another account's device.
				eq(pushSubscription.userId, userId),
			)
		).run();

		return { removed: result?.meta?.changes ?? 0 };
	},

	/** Best-effort cleanup for endpoints the push service reported as gone. */
	async removeByEndpoint(env, endpoint) {
		await orm({ env }).delete(pushSubscription)
			.where(eq(pushSubscription.endpoint, endpoint))
			.run();
	},

	/**
	 * Push a "new mail" notification to every device of one user.
	 *
	 * Never throws: the mail is already stored by the time this runs, and a
	 * dead endpoint must not affect the receive path.
	 */
	async notifyNewMail(env, userId, mail) {
		const vapid = vapidConfig(env);
		if (!vapid) return { sent: 0 };

		const owner = Number(userId) || 0;
		if (!owner) return { sent: 0 };

		let subscriptions = [];

		try {
			subscriptions = await orm({ env })
				.select({
					id: pushSubscription.id,
					endpoint: pushSubscription.endpoint,
					p256dh: pushSubscription.p256dh,
					auth: pushSubscription.auth,
				})
				.from(pushSubscription)
				.where(eq(pushSubscription.userId, owner))
				.all();
		} catch (error) {
			console.error('Nova Mail: could not load push subscriptions', error);
			return { sent: 0 };
		}

		if (!subscriptions.length) return { sent: 0 };

		const emailId = Number(mail?.emailId) || 0;
		const from = clean(mail?.from, MAX_SUBJECT_LENGTH) || 'Nova Mail';

		// No message body, no recipient list — just enough to identify the mail.
		const payload = JSON.stringify({
			title: 'Nova Mail',
			body: `收到来自 ${from} 的邮件`,
			subject: clean(mail?.subject, MAX_SUBJECT_LENGTH),
			url: `mail?emailId=${emailId}`,
			emailId,
		});

		let sent = 0;

		await Promise.all(subscriptions.map(async subscription => {
			try {
				const body = await encryptPayload({
					payload,
					p256dh: subscription.p256dh,
					auth: subscription.auth,
				});

				const authorization = await buildVapidAuthorization({
					endpoint: subscription.endpoint,
					publicKey: vapid.publicKey,
					privateKey: vapid.privateKey,
					subject: vapid.subject,
				});

				const response = await fetch(subscription.endpoint, {
					method: 'POST',
					headers: {
						Authorization: authorization,
						'Content-Encoding': 'aes128gcm',
						'Content-Type': 'application/octet-stream',
						TTL: '86400',
						Urgency: 'normal',
					},
					body,
				});

				if (response.ok) {
					sent++;
					return;
				}

				// 404/410 mean the subscription is gone for good: drop it.
				if (response.status === 404 || response.status === 410) {
					await this.removeByEndpoint(env, subscription.endpoint);
					return;
				}

				console.warn(`Nova Mail: push rejected (${response.status}) for subscription ${subscription.id}`);
			} catch (error) {
				console.error('Nova Mail: push delivery failed', error);
			}
		}));

		return { sent };
	},

	/**
	 * Fire-and-forget notification for the mail paths.
	 *
	 * Uses the runtime's `waitUntil` when there is one, so delivery never delays
	 * the receive/send flow and a rejected promise can never surface as a mail
	 * error. Accepts either a Hono context or `{ env, executionCtx }`.
	 */
	scheduleNewMail(context, userId, mail) {
		const task = this.notifyNewMail(context?.env, userId, mail).catch(error => {
			console.error('Nova Mail: push notification failed', error);
		});

		try {
			const executionCtx = context?.executionCtx;
			if (typeof executionCtx?.waitUntil === 'function') {
				executionCtx.waitUntil(task);
			}
		} catch {
			// Runtime without an ExecutionContext (unit tests, local tooling).
		}

		return task;
	},
};

export default pushService;
