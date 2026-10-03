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
};

export default userPreferencesService;
