-- v3.8 — body type (mail HTML / markdown / plain text).
--
-- This mirrors `v3_8DB` in src/init/init.js. The normal way to apply it is the
-- Worker's own initialization route, which the deploy workflow already calls:
--
--   curl -sL https://<your-domain>/api/init/<jwt_secret>      # expect: success
--
-- Use this file only when that route cannot be used, e.g. when the production
-- `jwt_secret` is not available:
--
--   wrangler d1 execute nova-mail --remote --file migrations/v3_8_body_type.sql
--
-- Notes:
--   * SQLite has no `ADD COLUMN IF NOT EXISTS`. On a database that already has
--     the column the first statement fails with `duplicate column name:
--     body_type`; that is safe to ignore, and the backfill below can be re-run
--     on its own at any time.
--   * The reader needs this value to choose a renderer: `text/html` goes through
--     the sandboxed iframe, `text/markdown` through markdown-it, `text/plain`
--     through the escaping parser. Rows written before this column existed are
--     classified from their data — a stored body means text/html, otherwise
--     text/plain.

ALTER TABLE email ADD COLUMN body_type TEXT NOT NULL DEFAULT '';

UPDATE email
SET body_type = CASE
	WHEN content IS NOT NULL AND TRIM(content) != '' THEN 'text/html'
	ELSE 'text/plain'
END
WHERE body_type = '' OR body_type IS NULL;
