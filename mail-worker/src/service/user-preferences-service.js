import BizError from '../error/biz-error';

const DEFAULT_DENSITY = 'normal';
const validDensities = new Set(['normal', 'compact']);

const userPreferencesService = {
  async get(c, userId) {
    const row = await c.env.db.prepare('SELECT mail_list_density FROM user_preferences WHERE user_id = ?')
      .bind(userId).first();
    return { mailListDensity: row?.mail_list_density || DEFAULT_DENSITY };
  },

  async setDensity(c, userId, value) {
    if (!validDensities.has(value)) throw new BizError('Invalid mail list density', 400);
    await c.env.db.prepare(`INSERT INTO user_preferences (user_id, mail_list_density) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET mail_list_density = excluded.mail_list_density`)
      .bind(userId, value).run();
    return { mailListDensity: value };
  },

  /**
   * The address the user explicitly chose as their default sender.
   *
   * `null` means "no choice stored" — which is the state of every existing
   * installation after the migration — and the runtime fallback in
   * `senderAddressService` then resolves the effective sender. A user who has
   * never opened this page has no `user_preferences` row at all.
   */
  async getDefaultSenderAccountId(c, userId) {
    const row = await c.env.db
      .prepare('SELECT default_sender_account_id FROM user_preferences WHERE user_id = ?')
      .bind(userId).first();
    const value = Number(row?.default_sender_account_id);
    return Number.isInteger(value) && value > 0 ? value : null;
  },

  /** Store (or clear) the configured default sender for one user. */
  async setDefaultSenderAccountId(c, userId, accountId) {
    const value = Number.isInteger(Number(accountId)) && Number(accountId) > 0 ? Number(accountId) : null;
    await c.env.db.prepare(`INSERT INTO user_preferences (user_id, default_sender_account_id) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET default_sender_account_id = excluded.default_sender_account_id`)
      .bind(userId, value).run();
    return value;
  },
};

export default userPreferencesService;
