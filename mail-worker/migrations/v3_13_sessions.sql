-- Login sessions and per-user security alert preferences.
CREATE TABLE IF NOT EXISTS auth_session (
  session_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL DEFAULT '',
  device_type TEXT NOT NULL DEFAULT 'Unknown',
  browser TEXT NOT NULL DEFAULT 'Unknown',
  os TEXT NOT NULL DEFAULT 'Unknown',
  user_agent TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS auth_session_user_active_idx ON auth_session(user_id, revoked_at, expires_at);
CREATE TABLE IF NOT EXISTS user_security_settings (
  user_id INTEGER PRIMARY KEY,
  login_alert_email INTEGER NOT NULL DEFAULT 1,
  login_alert_telegram INTEGER NOT NULL DEFAULT 0,
  telegram_chat_id TEXT NOT NULL DEFAULT ''
);
