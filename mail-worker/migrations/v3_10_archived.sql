-- v3.10 — archive flag (mobile swipe actions).
--
-- This mirrors `v3_10DB` in src/init/init.js. The normal way to apply it is the
-- Worker's one-time bootstrap route on a new installation:
--
--   curl -X POST https://<your-domain>/api/bootstrap -H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN"
--
-- For an existing database, bootstrap is unavailable; use this migration file:
--
--   wrangler d1 execute nova-mail --remote --file migrations/v3_10_archived.sql
--
-- Notes:
--   * SQLite has no `ADD COLUMN IF NOT EXISTS`. On a database that already has
--     the column, the ALTER fails with `duplicate column name: archived`; that
--     is safe to ignore.
--   * `archived = 1` hides a message from the Inbox without deleting it.
--     Deleted mail (`is_del = 1`) is unaffected, and the two flags are
--     independent.

ALTER TABLE email ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_email_user_archived ON email(user_id, archived);
