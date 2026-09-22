import orm from '../entity/orm';
import regKey from '../entity/reg-key';
import { inArray, like, eq, desc, sql, or } from 'drizzle-orm';
import roleService from './role-service';
import BizError from '../error/biz-error';
import { formatDetailDate, toUtc } from '../utils/date-uitil';
import userService from './user-service';
import { t } from '../i18n/i18n.js';

const regKeyService = {

	async add(c, params, userId) {

		let {code,roleId,count,expireTime} = params;

		if (!code) {
			throw new BizError(t('emptyRegKey'));
		}

		if (!count) {
			throw new BizError(t('emptyRegKey'));
		}

		if (!expireTime) {
			throw new BizError(t('emptyRegKeyExpire'));
		}

		const regKeyRow = await orm(c).select().from(regKey).where(eq(regKey.code, code)).get();

		if (regKeyRow) {
			throw new BizError(t('isExistRegKye'));
		}

		const roleRow = await roleService.selectById(c, roleId);
		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}
		await roleService.assertCanAssignRole(c, userId, null, roleRow);

		expireTime = formatDetailDate(expireTime)

		await orm(c).insert(regKey).values({code,roleId,count,userId,expireTime}).run();
	},

	async delete(c, params) {
		let {regKeyIds} = params;
		regKeyIds = regKeyIds.split(',').map(id => Number(id));
		await orm(c).delete(regKey).where(inArray(regKey.regKeyId,regKeyIds)).run();
	},

	async clearNotUse(c) {
		let now = formatDetailDate(toUtc().tz('Asia/Shanghai').startOf('day'))
		await orm(c).delete(regKey).where(or(eq(regKey.count, 0),sql`datetime(${regKey.expireTime}, '+8 hours') < datetime(${now})`)).run();
	},

	selectByCode(c, code) {
		return orm(c).select().from(regKey).where(eq(regKey.code, code)).get();
	},

	async list(c, params) {

		const {code} = params
		let query = orm(c).select().from(regKey)

		if (code) {
			query = query.where(like(regKey.code, `${code}%`))
		}

		const regKeyList = await query.orderBy(desc(regKey.regKeyId)).all();
		const roleList = await roleService.roleSelectUse(c);

		const today = toUtc().tz('Asia/Shanghai').startOf('day')

		regKeyList.forEach(regKeyRow => {

			const index = roleList.findIndex(roleRow => roleRow.roleId === regKeyRow.roleId)
			regKeyRow.roleName = index > -1 ? roleList[index].name : ''

			const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

			if (expireTime.isBefore(today)) {
				regKeyRow.expireTime = null
			}
		})

		return regKeyList;
	},

	/**
	 * D1 executes a batch as one transaction. The conditional decrement is the
	 * first write; the two inserts are gated by SQLite changes() and therefore
	 * cannot run unless that exact decrement succeeded. A uniqueness/account
	 * failure rolls the batch back, restoring the key count as well.
	 */
	async redeemAndCreateUser(c, { code, email, password, salt }) {
		const today = formatDetailDate(toUtc().tz('Asia/Shanghai').startOf('day'));
		const results = await c.env.db.batch([
			c.env.db.prepare(`
				UPDATE reg_key SET count = count - 1
				WHERE code = ? AND count > 0
				  AND datetime(expire_time, '+8 hours') >= datetime(?)
			`).bind(code, today),
			c.env.db.prepare(`
				INSERT INTO user (email, type, password, salt, reg_key_id)
				SELECT ?, role_id, ?, ?, rege_key_id FROM reg_key
				WHERE code = ? AND changes() = 1
			`).bind(email, password, salt, code),
			c.env.db.prepare(`
				INSERT INTO account (user_id, email, name)
				SELECT user_id, email, ? FROM user
				WHERE email COLLATE NOCASE = ? AND changes() = 1
			`).bind(email.split('@')[0], email)
		]);
		if (results[1].meta.changes !== 1 || results[2].meta.changes !== 1) return null;
		return await c.env.db.prepare('SELECT * FROM user WHERE email COLLATE NOCASE = ?').bind(email).first();
	},

	async history(c, params) {
		const { regKeyId } = params;
		return userService.listByRegKeyId(c, regKeyId);
	}
}

export default regKeyService;
