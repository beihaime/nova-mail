import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * One row per browser/PWA push subscription.
 *
 * A user may have many (desktop Chrome, Android Chrome, installed PWA…), and a
 * subscription belongs to exactly one endpoint, so `endpoint` is unique: when
 * the same browser subscribes again — or a different user signs in on it — the
 * existing row is updated instead of duplicated.
 */
export const pushSubscription = sqliteTable('push_subscription', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	endpoint: text('endpoint').notNull(),
	p256dh: text('p256dh').notNull(),
	auth: text('auth').notNull(),
	userAgent: text('user_agent').default('').notNull(),
	createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export default pushSubscription;
