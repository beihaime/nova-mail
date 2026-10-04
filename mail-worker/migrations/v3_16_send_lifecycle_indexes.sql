-- Indexes for the v3.16 – v3.22 send lifecycle schema.
--
-- Applied by the deployment workflow *after*
-- migrations/v3_16_send_lifecycle.sql created the tables and after the workflow
-- added the `email` / `attachments` / `outbound_send` columns these indexes
-- reference (SQLite cannot add a column conditionally in plain SQL).
--
-- Every statement is `CREATE INDEX ... IF NOT EXISTS`, so re-running is a no-op.
-- The two unique indexes are partial (`send_operation_id != ''`) so legacy rows,
-- which keep the default empty value, can never collide.

CREATE INDEX IF NOT EXISTS idx_outbound_send_user_status
	ON outbound_send(user_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_outbound_send_reconcile
	ON outbound_send(status, created_at, reconcile_lease_until);

CREATE INDEX IF NOT EXISTS idx_outbound_send_attachment_key
	ON outbound_send_attachment(object_key);

CREATE INDEX IF NOT EXISTS idx_storage_cleanup_due
	ON storage_cleanup(next_attempt_at);

-- v3.16: one finalized email / attachment per outbound operation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_operation
	ON email(send_operation_id, type, account_id, to_email)
	WHERE send_operation_id != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_attachment_send_operation
	ON attachments(send_operation_id, email_id, send_ordinal, type)
	WHERE send_operation_id != '';
