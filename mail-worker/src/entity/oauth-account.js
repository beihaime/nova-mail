import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * OAuth provider accounts bound to a Nova Mail user (v3.4+).
 *
 * Distinct from the legacy `oauth` table: the GitHub/Google flows store the
 * provider profile — including the provider avatar — here. The local-avatar
 * step of the sender resolver reads both, so a Nova Mail address keeps the
 * avatar its owner already saved.
 */
export const oauthAccount = sqliteTable('oauth_accounts', {
	oauthAccountId: integer('oauth_account_id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull(),
	provider: text('provider').notNull(),
	providerUserId: text('provider_user_id').notNull(),
	providerLogin: text('provider_login'),
	providerAvatarUrl: text('provider_avatar_url'),
	createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull()
});

export default oauthAccount;
