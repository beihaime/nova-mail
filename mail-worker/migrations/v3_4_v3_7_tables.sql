-- v3.4 – v3.7 — OAuth account links, OAuth handshake state, conversation indexes
-- and Web Push subscriptions, for installations that predate them.
--
-- These objects are created by `dbInit` (src/init/init.js: v3_4DB, v3_5DB,
-- v3_6DB, v3_7DB) on a fresh database. An already initialized D1 can never
-- bootstrap again, so the deployment workflow applies this file before the
-- v3.12 identity migration — which re-points OAuth links and push subscriptions
-- while merging duplicate identities — and before a Worker that reads them.
--
-- Every statement is `CREATE ... IF NOT EXISTS`, so a database that already has
-- some or all of the objects is left unchanged and re-running is a no-op. The
-- `email.thread_id` column that `idx_email_thread` indexes is added by the
-- workflow with a `pragma_table_info` guard, because SQLite has no
-- `ADD COLUMN IF NOT EXISTS`.

-- v3.4: OAuth provider accounts bound to a Nova Mail user.
CREATE TABLE IF NOT EXISTS oauth_accounts (
	oauth_account_id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	provider TEXT NOT NULL,
	provider_user_id TEXT NOT NULL,
	provider_login TEXT,
	provider_avatar_url TEXT,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_accounts_provider_identity
	ON oauth_accounts(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id);

-- v3.5: in-flight OAuth transactions and one-time login grants.
CREATE TABLE IF NOT EXISTS oauth_transactions (
	state TEXT PRIMARY KEY,
	provider TEXT NOT NULL,
	intent TEXT NOT NULL,
	browser_token TEXT NOT NULL,
	code_verifier TEXT,
	nonce TEXT,
	user_id INTEGER,
	session_token TEXT,
	expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_login_grants (
	grant TEXT PRIMARY KEY,
	transaction_state TEXT NOT NULL,
	browser_token TEXT NOT NULL,
	token TEXT NOT NULL,
	expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_transactions_expiry ON oauth_transactions(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_login_grants_expiry ON oauth_login_grants(expires_at);

-- v3.6: indexes the conversation lookups rely on. The columns themselves are
-- ensured by the workflow before this file runs.
CREATE INDEX IF NOT EXISTS idx_email_thread ON email(user_id, thread_id, email_id);
CREATE INDEX IF NOT EXISTS idx_email_message_id ON email(user_id, message_id);

-- v3.7: one Web Push subscription per browser/PWA endpoint.
CREATE TABLE IF NOT EXISTS push_subscription (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL,
	endpoint TEXT NOT NULL,
	p256dh TEXT NOT NULL,
	auth TEXT NOT NULL,
	user_agent TEXT NOT NULL DEFAULT '',
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscription_endpoint ON push_subscription(endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscription_user ON push_subscription(user_id);
