/**
 * The schema the current Worker source requires, as data.
 *
 * Kept free of Node built-ins so both the deployment CLI
 * (scripts/check-schema.mjs) and the Worker integration harness can import it.
 * The repository schema — not a version number — is the source of truth, and
 * the integration harness asserts this manifest against a freshly bootstrapped
 * database so it cannot silently drift.
 */

export const REQUIRED_TABLES = Object.freeze([
	// v3.4 – v3.7
	'oauth_accounts', 'oauth_transactions', 'oauth_login_grants', 'push_subscription',
	// v3.13 authentication boundary
	'auth_session', 'user_security_settings',
	// v3.14 preferences
	'user_preferences',
	// v3.16 – v3.23 outbound lifecycle, cleanup and webhook processing
	'outbound_send', 'outbound_send_snapshot', 'outbound_send_attachment',
	'storage_cleanup', 'resend_webhook_event', 'resend_recipient_delivery',
]);

export const REQUIRED_COLUMNS = Object.freeze({
	// Runtime-critical identity columns (v1.4 / v2.6 / v2.8 / v3.12).
	user: ['email', 'is_del', 'reg_key_id'],
	account: ['email', 'user_id', 'is_del', 'all_receive', 'sort'],
	// Recent mail schema the current list/reader queries.
	email: [
		'body_type', 'thread_id', 'parent_message_id', 'archived', 'bimi_selector',
		'auth_results', 'trashed', 'trashed_at', 'trash_archived', 'send_operation_id',
	],
	attachments: ['send_operation_id', 'send_ordinal'],
	user_preferences: ['mail_list_density', 'default_sender_account_id'],
	auth_session: ['session_id', 'user_id', 'token_hash', 'device_id', 'expires_at', 'revoked_at'],
	user_security_settings: ['user_id', 'login_alert_email', 'login_alert_telegram', 'telegram_chat_id'],
	outbound_send: [
		'operation_id', 'user_id', 'request_key', 'request_hash', 'status', 'quota_cost',
		'provider_id', 'email_id', 'created_at', 'updated_at',
		'reconcile_lease_until', 'reconcile_lease_token',
	],
	outbound_send_snapshot: ['operation_id', 'canonical_payload', 'payload_hash', 'created_at'],
	outbound_send_attachment: ['operation_id', 'ordinal', 'object_key'],
	storage_cleanup: ['object_key', 'status', 'attempts', 'last_error', 'next_attempt_at', 'created_at', 'updated_at'],
	resend_webhook_event: ['event_id', 'event_type', 'resend_email_id', 'created_at', 'status', 'processing_until', 'applied_at'],
	resend_recipient_delivery: ['email_id', 'recipient', 'status', 'status_rank', 'message', 'updated_at'],
});

export const REQUIRED_INDEXES = Object.freeze([
	// v3.12 — case-insensitive mailbox identity keys.
	'idx_user_email_nocase', 'idx_account_email_nocase',
	// v3.15 — mailbox-scoped Message-ID uniqueness.
	'idx_email_mailbox_message_id_unique',
	// v3.11 — Trash-aware list queries.
	'idx_email_user_trashed',
	// v3.4 – v3.7.
	'idx_oauth_accounts_provider_identity', 'idx_oauth_transactions_expiry',
	'idx_oauth_login_grants_expiry', 'idx_push_subscription_endpoint',
	'idx_email_thread', 'idx_email_message_id',
	// v3.16 – v3.23.
	'idx_outbound_send_user_status', 'idx_outbound_send_reconcile',
	'idx_outbound_send_attachment_key', 'idx_storage_cleanup_due',
	'idx_email_send_operation', 'idx_attachment_send_operation',
	'idx_resend_recipient_delivery_email',
]);

/**
 * Data invariants the deployment must not violate. Each key is compared for
 * exact equality against the value queried from the database.
 */
export const REQUIRED_INVARIANTS = Object.freeze({
	noncanonical_user: 0,
	noncanonical_account: 0,
});

function asColumnSet(columns) {
	if (Array.isArray(columns)) return new Set(columns);
	if (columns && typeof columns === 'object') {
		const set = new Set();
		for (const [table, list] of Object.entries(columns)) {
			for (const column of list || []) set.add(`${table}.${column}`);
		}
		return set;
	}
	return new Set();
}

/**
 * @param {{ tables?: string[], indexes?: string[], columns?: string[]|Record<string,string[]>, invariants?: Record<string, number> }} actual
 * @returns {{ ok: boolean, missing: string[], violations: string[] }}
 */
export function checkSchema(actual = {}) {
	const tables = new Set(actual.tables || []);
	const indexes = new Set(actual.indexes || []);
	const columns = asColumnSet(actual.columns);
	const invariants = actual.invariants || {};

	const missing = [];

	for (const table of REQUIRED_TABLES) {
		if (!tables.has(table)) missing.push(`table ${table}`);
	}
	for (const [table, list] of Object.entries(REQUIRED_COLUMNS)) {
		for (const column of list) {
			if (!columns.has(`${table}.${column}`)) missing.push(`column ${table}.${column}`);
		}
	}
	for (const index of REQUIRED_INDEXES) {
		if (!indexes.has(index)) missing.push(`index ${index}`);
	}

	const violations = [];
	for (const [key, expected] of Object.entries(REQUIRED_INVARIANTS)) {
		const value = Number(invariants[key]);
		if (!Number.isFinite(value) || value !== expected) {
			violations.push(`invariant ${key}: expected ${expected}, got ${invariants[key]}`);
		}
	}

	return { ok: missing.length === 0 && violations.length === 0, missing, violations };
}
