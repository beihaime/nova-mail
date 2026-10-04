-- v3.12 — canonical mailbox identities for existing installations.
--
-- `dbInit.v3_12DB` (src/init/init.js) performs this work on a fresh database
-- through the one-time `/api/bootstrap` route. An already initialized D1 can
-- never bootstrap again (the route answers 409), so a released Worker that
-- compares mailbox identities case-insensitively disagrees with a database whose
-- `user.email` / `account.email` values still carry their original case or
-- surrounding whitespace. This forward-only, idempotent migration closes that
-- gap before the Worker is released.
--
-- Guarantees:
--   * no message, attachment, star, push subscription or OAuth link is deleted —
--     dependent rows are re-pointed to the surviving identity;
--   * duplicate identities collapse into the oldest, non-deleted row, so no
--     duplicate mailbox is ever created;
--   * every statement is repeatable: a second run changes nothing.
--
-- No `PRAGMA foreign_keys` toggling is needed: every dependent row is re-pointed
-- to the surviving identity before a duplicate row is removed.
--
-- Reference coverage. Every user/account reference that exists at v3.12 time is
-- re-pointed: `account`, `email`, `attachments`, `star`, `push_subscription`,
-- `oauth_accounts` and `oauth` — the same set `dbInit.v3_12DB` merges. The
-- user-scoped tables introduced *after* v3.12 (`auth_session` v3.13,
-- `user_preferences` v3.14, `user_security_settings` v3.13) are deliberately not
-- touched here: they do not exist yet when this migration runs, and both the
-- bootstrap path and this file run v3.12 before them. A merged-away session is
-- simply re-authenticated; `user_preferences` carries an ON DELETE CASCADE and
-- `user_security_settings` belongs to the surviving identity.

-- ---------------------------------------------------------------------------
-- 1. Merge duplicate `user` identities (same lower(trim(email))).
--    Keeper = non-deleted first, then the lowest user_id. Every dependent row
--    is re-pointed before the duplicate row is removed.
-- ---------------------------------------------------------------------------
UPDATE account SET user_id = (
	SELECT keeper.user_id
	  FROM user AS self
	  JOIN user AS keeper ON lower(trim(keeper.email)) = lower(trim(self.email))
	 WHERE self.user_id = account.user_id
	 ORDER BY keeper.is_del ASC, keeper.user_id ASC
	 LIMIT 1
)
WHERE user_id IN (
	SELECT self.user_id
	  FROM user AS self
	  JOIN user AS other ON lower(trim(other.email)) = lower(trim(self.email))
	 WHERE other.user_id != self.user_id
	   AND (other.is_del < self.is_del
	        OR (other.is_del = self.is_del AND other.user_id < self.user_id))
);

UPDATE email SET user_id = (
	SELECT keeper.user_id
	  FROM user AS self
	  JOIN user AS keeper ON lower(trim(keeper.email)) = lower(trim(self.email))
	 WHERE self.user_id = email.user_id
	 ORDER BY keeper.is_del ASC, keeper.user_id ASC
	 LIMIT 1
)
WHERE user_id IN (
	SELECT self.user_id
	  FROM user AS self
	  JOIN user AS other ON lower(trim(other.email)) = lower(trim(self.email))
	 WHERE other.user_id != self.user_id
	   AND (other.is_del < self.is_del
	        OR (other.is_del = self.is_del AND other.user_id < self.user_id))
);

UPDATE attachments SET user_id = (
	SELECT keeper.user_id
	  FROM user AS self
	  JOIN user AS keeper ON lower(trim(keeper.email)) = lower(trim(self.email))
	 WHERE self.user_id = attachments.user_id
	 ORDER BY keeper.is_del ASC, keeper.user_id ASC
	 LIMIT 1
)
WHERE user_id IN (
	SELECT self.user_id
	  FROM user AS self
	  JOIN user AS other ON lower(trim(other.email)) = lower(trim(self.email))
	 WHERE other.user_id != self.user_id
	   AND (other.is_del < self.is_del
	        OR (other.is_del = self.is_del AND other.user_id < self.user_id))
);

UPDATE star SET user_id = (
	SELECT keeper.user_id
	  FROM user AS self
	  JOIN user AS keeper ON lower(trim(keeper.email)) = lower(trim(self.email))
	 WHERE self.user_id = star.user_id
	 ORDER BY keeper.is_del ASC, keeper.user_id ASC
	 LIMIT 1
)
WHERE user_id IN (
	SELECT self.user_id
	  FROM user AS self
	  JOIN user AS other ON lower(trim(other.email)) = lower(trim(self.email))
	 WHERE other.user_id != self.user_id
	   AND (other.is_del < self.is_del
	        OR (other.is_del = self.is_del AND other.user_id < self.user_id))
);

UPDATE push_subscription SET user_id = (
	SELECT keeper.user_id
	  FROM user AS self
	  JOIN user AS keeper ON lower(trim(keeper.email)) = lower(trim(self.email))
	 WHERE self.user_id = push_subscription.user_id
	 ORDER BY keeper.is_del ASC, keeper.user_id ASC
	 LIMIT 1
)
WHERE user_id IN (
	SELECT self.user_id
	  FROM user AS self
	  JOIN user AS other ON lower(trim(other.email)) = lower(trim(self.email))
	 WHERE other.user_id != self.user_id
	   AND (other.is_del < self.is_del
	        OR (other.is_del = self.is_del AND other.user_id < self.user_id))
);

UPDATE oauth_accounts SET user_id = (
	SELECT keeper.user_id
	  FROM user AS self
	  JOIN user AS keeper ON lower(trim(keeper.email)) = lower(trim(self.email))
	 WHERE self.user_id = oauth_accounts.user_id
	 ORDER BY keeper.is_del ASC, keeper.user_id ASC
	 LIMIT 1
)
WHERE user_id IN (
	SELECT self.user_id
	  FROM user AS self
	  JOIN user AS other ON lower(trim(other.email)) = lower(trim(self.email))
	 WHERE other.user_id != self.user_id
	   AND (other.is_del < self.is_del
	        OR (other.is_del = self.is_del AND other.user_id < self.user_id))
);

UPDATE oauth SET user_id = (
	SELECT keeper.user_id
	  FROM user AS self
	  JOIN user AS keeper ON lower(trim(keeper.email)) = lower(trim(self.email))
	 WHERE self.user_id = oauth.user_id
	 ORDER BY keeper.is_del ASC, keeper.user_id ASC
	 LIMIT 1
)
WHERE user_id IN (
	SELECT self.user_id
	  FROM user AS self
	  JOIN user AS other ON lower(trim(other.email)) = lower(trim(self.email))
	 WHERE other.user_id != self.user_id
	   AND (other.is_del < self.is_del
	        OR (other.is_del = self.is_del AND other.user_id < self.user_id))
);

DELETE FROM user WHERE user_id IN (
	SELECT self.user_id
	  FROM user AS self
	  JOIN user AS other ON lower(trim(other.email)) = lower(trim(self.email))
	 WHERE other.user_id != self.user_id
	   AND (other.is_del < self.is_del
	        OR (other.is_del = self.is_del AND other.user_id < self.user_id))
);

-- ---------------------------------------------------------------------------
-- 2. Merge duplicate `account` identities, re-pointing mail and attachments.
-- ---------------------------------------------------------------------------
UPDATE email SET
	account_id = (
		SELECT keeper.account_id
		  FROM account AS self
		  JOIN account AS keeper ON lower(trim(keeper.email)) = lower(trim(self.email))
		 WHERE self.account_id = email.account_id
		 ORDER BY keeper.is_del ASC, keeper.account_id ASC
		 LIMIT 1
	),
	user_id = (
		SELECT keeper.user_id
		  FROM account AS self
		  JOIN account AS keeper ON lower(trim(keeper.email)) = lower(trim(self.email))
		 WHERE self.account_id = email.account_id
		 ORDER BY keeper.is_del ASC, keeper.account_id ASC
		 LIMIT 1
	)
WHERE account_id IN (
	SELECT self.account_id
	  FROM account AS self
	  JOIN account AS other ON lower(trim(other.email)) = lower(trim(self.email))
	 WHERE other.account_id != self.account_id
	   AND (other.is_del < self.is_del
	        OR (other.is_del = self.is_del AND other.account_id < self.account_id))
);

UPDATE attachments SET
	account_id = (
		SELECT keeper.account_id
		  FROM account AS self
		  JOIN account AS keeper ON lower(trim(keeper.email)) = lower(trim(self.email))
		 WHERE self.account_id = attachments.account_id
		 ORDER BY keeper.is_del ASC, keeper.account_id ASC
		 LIMIT 1
	),
	user_id = (
		SELECT keeper.user_id
		  FROM account AS self
		  JOIN account AS keeper ON lower(trim(keeper.email)) = lower(trim(self.email))
		 WHERE self.account_id = attachments.account_id
		 ORDER BY keeper.is_del ASC, keeper.account_id ASC
		 LIMIT 1
	)
WHERE account_id IN (
	SELECT self.account_id
	  FROM account AS self
	  JOIN account AS other ON lower(trim(other.email)) = lower(trim(self.email))
	 WHERE other.account_id != self.account_id
	   AND (other.is_del < self.is_del
	        OR (other.is_del = self.is_del AND other.account_id < self.account_id))
);

DELETE FROM account WHERE account_id IN (
	SELECT self.account_id
	  FROM account AS self
	  JOIN account AS other ON lower(trim(other.email)) = lower(trim(self.email))
	 WHERE other.account_id != self.account_id
	   AND (other.is_del < self.is_del
	        OR (other.is_del = self.is_del AND other.account_id < self.account_id))
);

-- ---------------------------------------------------------------------------
-- 3. Canonicalize the surviving identities and every stored address.
-- ---------------------------------------------------------------------------
UPDATE user SET email = lower(trim(email)) WHERE email != lower(trim(email));
UPDATE account SET email = lower(trim(email)) WHERE email != lower(trim(email));
UPDATE email SET send_email = lower(trim(send_email))
	WHERE send_email IS NOT NULL AND send_email != lower(trim(send_email));
UPDATE email SET to_email = lower(trim(to_email))
	WHERE to_email IS NOT NULL AND to_email != lower(trim(to_email));

-- ---------------------------------------------------------------------------
-- 4. Case-insensitive unique keys. The legacy case-sensitive indexes would
--    reject a canonicalization that has not happened yet, so they go last.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_user_email;
DROP INDEX IF EXISTS idx_account_email;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email_nocase ON user (email COLLATE NOCASE);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_email_nocase ON account (email COLLATE NOCASE);
