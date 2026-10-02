-- v3.11 — mailbox Trash state.
--
-- This mirrors `v3_11DB` in src/init/init.js. New installations receive these
-- fields from the Worker's one-time bootstrap route. Existing installations
-- must run this file before deploying the Trash-aware Worker:
--
--   wrangler d1 execute nova-mail --remote --file migrations/v3_11_trash.sql
--
-- SQLite does not support `ADD COLUMN IF NOT EXISTS`. Run this one-time
-- migration only when `pragma_table_info('email')` does not yet show
-- `trashed`, `trashed_at`, and `trash_archived`. The GitHub deployment
-- workflow performs the same checks and applies missing fields individually,
-- so it is safe for partially upgraded databases.
--
-- `trashed = 1` hides the owner's mail from normal lists. `trash_archived`
-- retains its previous archive state so restoring from Trash returns the mail
-- to the right mailbox.

ALTER TABLE email ADD COLUMN trashed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email ADD COLUMN trashed_at TEXT NOT NULL DEFAULT '';
ALTER TABLE email ADD COLUMN trash_archived INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_email_user_trashed ON email(user_id, trashed, account_id);
