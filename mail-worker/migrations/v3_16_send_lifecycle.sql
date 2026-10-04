-- v3.16 – v3.22 — outbound send lifecycle, transient-storage cleanup and
-- Resend webhook idempotency, for installations that predate these versions.
--
-- New installations receive exactly these objects from `dbInit` in
-- src/init/init.js (v3_16DB, v3_17DB, v3_18DB, v3_19DB, v3_21DB) through the
-- one-time `/api/bootstrap` route. Existing installations can never bootstrap
-- again (the route answers 409), so the deployment workflow applies this file
-- before it releases a Worker that queries these tables.
--
-- Every statement is `CREATE TABLE ... IF NOT EXISTS`, so the file is safe to
-- run on a database that already has some or all of the objects. The
-- `email` / `attachments` / `outbound_send` columns these tables depend on are
-- added by the workflow with `pragma_table_info` guards (SQLite has no
-- `ADD COLUMN IF NOT EXISTS`) and the indexes are applied afterwards by
-- migrations/v3_16_send_lifecycle_indexes.sql.
--
-- Additive only: no existing row, table or index is dropped or rewritten.

-- v3.16: durable outbound operation record.
CREATE TABLE IF NOT EXISTS outbound_send (
	operation_id TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL,
	request_key TEXT NOT NULL,
	request_hash TEXT NOT NULL,
	status TEXT NOT NULL,
	quota_cost INTEGER NOT NULL DEFAULT 0,
	provider_id TEXT NOT NULL DEFAULT '',
	email_id INTEGER,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	UNIQUE(user_id, request_key),
	CHECK (status IN ('reserved','dispatching','accepted','finalizing','failed','finalized'))
);

-- v3.19: immutable payload for retried finalization.
CREATE TABLE IF NOT EXISTS outbound_send_snapshot (
	operation_id TEXT PRIMARY KEY REFERENCES outbound_send(operation_id) ON DELETE CASCADE,
	canonical_payload TEXT NOT NULL,
	payload_hash TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

-- v3.21: attachment references held by unresolved outbound snapshots.
CREATE TABLE IF NOT EXISTS outbound_send_attachment (
	operation_id TEXT NOT NULL REFERENCES outbound_send(operation_id) ON DELETE CASCADE,
	ordinal INTEGER NOT NULL,
	object_key TEXT NOT NULL,
	PRIMARY KEY(operation_id, ordinal)
);

-- v3.17: transient object cleanup queue.
CREATE TABLE IF NOT EXISTS storage_cleanup (
	object_key TEXT PRIMARY KEY,
	status TEXT NOT NULL DEFAULT 'pending',
	attempts INTEGER NOT NULL DEFAULT 0,
	last_error TEXT NOT NULL DEFAULT '',
	next_attempt_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	CHECK (status IN ('pending', 'retrying'))
);

-- v3.18: idempotency for repeated Resend webhook deliveries.
CREATE TABLE IF NOT EXISTS resend_webhook_event (
	event_id TEXT PRIMARY KEY,
	event_type TEXT NOT NULL,
	resend_email_id TEXT NOT NULL,
	created_at INTEGER NOT NULL
);



-- v3.23 recipient delivery records. ALTER-only event lifecycle columns are
-- guarded by the deployment workflow because SQLite lacks ADD COLUMN IF NOT
-- EXISTS; new installations receive them through init.js.
CREATE TABLE IF NOT EXISTS resend_recipient_delivery (
  email_id INTEGER NOT NULL,
  recipient TEXT NOT NULL,
  status INTEGER NOT NULL,
  status_rank INTEGER NOT NULL,
  message TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(email_id, recipient)
);
CREATE INDEX IF NOT EXISTS idx_resend_recipient_delivery_email ON resend_recipient_delivery(email_id);
