import BizError from "../error/biz-error";
import orm from "../entity/orm";
import {oauth} from "../entity/oauth";
import { eq, inArray } from 'drizzle-orm';
import userService from "./user-service";
import loginService from "./login-service";
import cryptoUtils from "../utils/crypto-utils";
import settingService from "./setting-service";
import {t} from '../i18n/i18n';
import { v4 as uuidv4 } from 'uuid';
import KvConst from '../const/kv-const';

function assertSafeRedirectUri(c, redirectUri) {
	if (!redirectUri || typeof redirectUri !== 'string') {
		throw new BizError('Invalid redirect_uri');
	}
	let parsed;
	try {
		parsed = new URL(redirectUri);
	} catch {
		throw new BizError('Invalid redirect_uri');
	}
	const origin = new URL(c.req.url).origin;
	if (parsed.origin !== origin) {
		throw new BizError('redirect_uri must match this site');
	}
}

const oauthService = {

	async bindUser(c, params) {

		const { email, bindToken, code } = params;
		if (!bindToken) {
			throw new BizError('OAuth binding has expired');
		}

		const bindInfo = await c.env.kv.get(KvConst.OAUTH_BIND + bindToken, { type: 'json' });
		if (!bindInfo?.oauthUserId) {
			throw new BizError('OAuth binding has expired');
		}

		const oauthRow = await this.getById(c, bindInfo.oauthUserId);
		if (!oauthRow) {
			throw new BizError('OAuth user does not exist');
		}

		let userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (userRow) {
			throw new BizError('用户已绑定有邮箱')
		}

		// OAuth login verifies the external identity, but account creation must still
		// honor this installation's registration and registration-key policy.
		await loginService.register(c, { email, password: cryptoUtils.genRandomPwd(), code }, true);

		userRow = await userService.selectByEmail(c, email);

		await orm(c).update(oauth).set({ userId: userRow.userId }).where(eq(oauth.oauthUserId, oauthRow.oauthUserId)).run();
		await c.env.kv.delete(KvConst.OAUTH_BIND + bindToken);
		const jwtToken = await loginService.login(c, { email, password: null }, true);

		return { userInfo: oauthRow, token: jwtToken}
	},

	async linuxDoLogin(c, params) {

		const { code, redirectUri } = params;
		assertSafeRedirectUri(c, redirectUri);

		const setting = await settingService.query(c);
		this.assertEnabled(setting, 'linuxdoSwitch');

		const reqParams = new URLSearchParams()
		reqParams.append('client_id', setting.linuxdoClientId)
		reqParams.append('client_secret', setting.linuxdoClientSecret)
		reqParams.append('code', code)
		reqParams.append('redirect_uri', redirectUri)
		reqParams.append('grant_type', 'authorization_code')

		const tokenRes = await fetch("https://connect.linux.do/oauth2/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: reqParams.toString()
		})

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText)
		}

		const token = await tokenRes.json()

		const userRes = await fetch('https://connect.linux.do/api/user', {
			headers: {
				Authorization: 'Bearer ' + token.access_token
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText)
		}

		const userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.id);
		userInfo.active = userInfo.active ? 0 : 1;
		userInfo.silenced = userInfo.silenced ? 0 : 1;
		userInfo.trustLevel = userInfo.trust_level;
		userInfo.avatar = userInfo.avatar_url;
		userInfo.platform = 'linuxdo';

		return await this.saveAndLogin(c, userInfo)
	},

	async saveAndLogin(c, userInfo) {

		const oauthRow = await this.saveUser(c, userInfo);
		const userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (!userRow) {
			const bindToken = uuidv4();
			await c.env.kv.put(KvConst.OAUTH_BIND + bindToken, JSON.stringify({
				oauthUserId: oauthRow.oauthUserId
			}), { expirationTtl: 600 });
			return { userInfo: oauthRow, token: null, bindToken };
		}

		const JwtToken = await loginService.login(c, { email: userRow.email, password: null }, true);
		return { userInfo: oauthRow, token: JwtToken };
	},

	async saveUser(c, userInfo) {

		const userInfoRow = await this.getById(c, userInfo.oauthUserId);

		if (!userInfoRow) {
			return await orm(c).insert(oauth).values(userInfo).returning().get();
		} else {
			return await orm(c).update(oauth).set(userInfo).where(eq(oauth.oauthUserId, userInfo.oauthUserId)).returning().get();
		}

	},

	assertEnabled(setting, switchKey) {
		if (setting[switchKey] !== 0) {
			throw new BizError(t('oauthDisabled'));
		}
	},

	async getById(c, oauthUserId) {
		return await orm(c).select().from(oauth).where(eq(oauth.oauthUserId, oauthUserId)).get();
	},

	async deleteByUserId(c, userId) {
		await this.deleteByUserIds(c, [userId]);
	},

	async deleteByUserIds(c, userIds) {
		await orm(c).delete(oauth).where(inArray(oauth.userId, userIds)).run();
		if (userIds.length) {
			try {
				await c.env.db.prepare(`DELETE FROM oauth_accounts WHERE user_id IN (${userIds.map(() => '?').join(',')})`).bind(...userIds).run();
			} catch (error) {
				if (!String(error.message).includes('no such table')) throw error;
			}
		}
	},

	//定时任务凌晨清除未绑定邮箱的oauth用户
	async clearNoBindOathUser(c) {
		await orm(c).delete(oauth).where(eq(oauth.userId, 0)).run();
	},

}

export default  oauthService
