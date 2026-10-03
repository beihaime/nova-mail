-- Per-user mail display preferences. Existing users read the default until
-- they save a preference; no existing account or session rows are changed.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES user(user_id) ON DELETE CASCADE,
  mail_list_density TEXT NOT NULL DEFAULT 'normal'
    CHECK (mail_list_density IN ('normal', 'compact'))
);
