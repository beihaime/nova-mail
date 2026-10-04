import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import {verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import {t} from '../i18n/i18n'
import verifyRecordService from './verify-record-service';
import userContext from '../security/user-context';
import domainUtils from '../utils/domain-uitls';
import urlSafety from '../utils/url-safety';
import { configuredDomains } from '../utils/configured-domains';

function isMaskedSecret(value) {
	if (value == null || typeof value !== 'string') return false;
	return value.includes('******') || value === '********';
}

const MAX_BACKGROUND_BYTES = 5 * 1024 * 1024;

function rasterBackgroundType(bytes) {
	const data = new Uint8Array(bytes);
	if (data.length < 12 || data.length > MAX_BACKGROUND_BYTES) return '';
	if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return 'image/png';
	if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
	if (String.fromCharCode(...data.slice(0, 4)) === 'RIFF' && String.fromCharCode(...data.slice(8, 12)) === 'WEBP') return 'image/webp';
	return '';
}

const settingService = {

	async refresh(c) {
		const settingRow = await orm(c).select().from(setting).get();
		settingRow.resendTokens = JSON.parse(settingRow.resendTokens);
		c.set('setting', settingRow);
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(settingRow));
	},

	async query(c) {

		if (c.get?.('setting')) {
			return c.get('setting')
		}

		const setting = await c.env.kv.get(KvConst.SETTING, { type: 'json' });

		if (!setting) {
			throw new BizError('数据库未初始化 Database not initialized.');
		}

		const domainList = configuredDomains(c.env.domain).map(item => '@' + item);
		setting.domainList = domainList;

		let projectLink = c.env.project_link;
		if (typeof projectLink === 'string' && projectLink === 'false') {
			projectLink = false
		} else if (projectLink === false) {
			projectLink = false
		} else {
			projectLink = true
		}

		setting.projectLink = projectLink;

		setting.emailPrefixFilter = setting.emailPrefixFilter.split(",").filter(Boolean);

		c.set?.('setting', setting);
		return setting;
	},

	async get(c, showSiteKey = false) {

		const [settingRow, recordList] = await Promise.all([
			await this.query(c),
			verifyRecordService.selectListByIP(c)
		]);
		// Legacy SVG backgrounds may be active documents when navigated directly
		// on the application origin. Keep the object for administrators to replace,
		// but never publish it as a usable login background.
		if (/\.svg(?:$|[?#])/i.test(String(settingRow.background || ''))) settingRow.background = '';


		if (!showSiteKey) {
			settingRow.siteKey = settingRow.siteKey ? `${settingRow.siteKey.slice(0, 6)}******` : null;
		}

		// Turnstile secrets belong to Workers Secrets. Do not return the legacy D1
		// column, even masked, to browser clients.
		delete settingRow.secretKey;
		// GitHub OAuth now reads its credentials exclusively from Workers Secrets.
		// Do not expose legacy database credentials through the administration API.
		delete settingRow.githubClientId;
		delete settingRow.githubClientSecret;
		delete settingRow.githubSwitch;

		Object.keys(settingRow.resendTokens || {}).forEach(key => {
			settingRow.resendTokens[key] = `${settingRow.resendTokens[key].slice(0, 12)}******`;
		});

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;

		// Never return any fragment of the bot token — only whether it is configured.
		settingRow.hasTgBot = !!settingRow.tgBotToken;
		delete settingRow.tgBotToken;

		settingRow.hasR2 = !!c.env.r2
		settingRow.hasCfEmail = !!c.env.email

		let regVerifyOpen = false
		let addVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = row.count >= settingRow.addVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen

		settingRow.storageType = await r2Service.storageType(c);

		return settingRow;
	},

	async set(c, params) {
		// This key was historically stored in D1. Keep the column for backwards
		// compatible schemas, but never persist another Turnstile secret there.
		delete params.secretKey;
		// GitHub OAuth credentials are Workers Secrets, not mutable D1 settings.
		delete params.githubClientId;
		delete params.githubClientSecret;
		delete params.githubSwitch;

		// Do not overwrite real secrets with masked placeholders from the admin UI.
		if (isMaskedSecret(params.tgBotToken)) delete params.tgBotToken;
		if (isMaskedSecret(params.s3AccessKey)) delete params.s3AccessKey;
		if (isMaskedSecret(params.s3SecretKey)) delete params.s3SecretKey;
		if (params.resendTokens && typeof params.resendTokens === 'object') {
			Object.keys(params.resendTokens).forEach(domain => {
				if (isMaskedSecret(params.resendTokens[domain])) {
					delete params.resendTokens[domain];
				}
			});
		}

		if (params.webhookUrl !== undefined && params.webhookUrl) {
			const normalized = domainUtils.toOssDomain(params.webhookUrl) || '';
			if (normalized) {
				urlSafety.assertSafeWebhookUrl(normalized);
			}
			params.webhookUrl = normalized;
		}

		const settingData = await this.query(c);
		let resendTokens = { ...settingData.resendTokens, ...params.resendTokens };
		Object.keys(resendTokens).forEach(domain => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		if (Array.isArray(params.emailPrefixFilter)) {
			params.emailPrefixFilter = params.emailPrefixFilter + '';
		}

		if (Array.isArray(params.aiCodeFilter)) {
			params.aiCodeFilter = params.aiCodeFilter + '';
		}

		params.resendTokens = JSON.stringify(resendTokens);

		await orm(c).update(setting).set({ ...params }).returning().get();
		await this.refresh(c);
	},

	async deleteBackground(c) {

		const { background } = await this.query(c);
		if (!background) return

		if (background.startsWith('http')) {
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
			return;
		}

		if (background) {
			await r2Service.delete(c,background)
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
		}
	},

	async setBackground(c, params) {

		let { background } = params
		let upload = null;

		if (background && !background.startsWith('http')) {

			const file = fileUtils.base64ToFile(background)

			const arrayBuffer = await file.arrayBuffer();
			const contentType = rasterBackgroundType(arrayBuffer);
			if (!contentType) throw new BizError('Background must be a PNG, JPEG, or WebP image no larger than 5 MB');
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);
			upload = { arrayBuffer, contentType };
		}

		await this.deleteBackground(c);

		if (upload) {
			await r2Service.putObj(c, background, upload.arrayBuffer, {
				contentType: upload.contentType,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: `inline; filename="background.${upload.contentType === 'image/png' ? 'png' : upload.contentType === 'image/jpeg' ? 'jpg' : 'webp'}"`
			});

		}

		await orm(c).update(setting).set({ background }).run();
		await this.refresh(c);
		return background;
	},


	async setBlacklist(c, params) {
		const { blackSubject, blackContent, blackFrom  } = params
		await orm(c).update(setting).set({ blackSubject, blackContent, blackFrom }).run();
		await this.refresh(c);
		return this.get(c);
	},

	async websiteConfig(c) {

		const settingRow = await this.get(c, true);
		const token = await userContext.getToken(c);

		return {
			register: settingRow.register,
			title: settingRow.title,
			manyEmail: settingRow.manyEmail,
			addEmail: settingRow.addEmail,
			autoRefresh: settingRow.autoRefresh,
			addEmailVerify: settingRow.addEmailVerify,
			registerVerify: settingRow.registerVerify,
			send: settingRow.send,
			r2Domain: settingRow.r2Domain,
			siteKey: settingRow.siteKey,
			background: settingRow.background,
			loginOpacity: settingRow.loginOpacity,
			domainList: settingRow.loginDomain === 1 && !token ? [] : settingRow.domainList,
			regKey: settingRow.regKey,
			regVerifyOpen: settingRow.regVerifyOpen,
			addVerifyOpen: settingRow.addVerifyOpen,
			noticeTitle: settingRow.noticeTitle,
			noticeContent: settingRow.noticeContent,
			noticeType: settingRow.noticeType,
			noticeDuration: settingRow.noticeDuration,
			noticePosition: settingRow.noticePosition,
			noticeWidth: settingRow.noticeWidth,
			noticeOffset: settingRow.noticeOffset,
			notice: settingRow.notice,
			loginDomain: settingRow.loginDomain,
			linuxdoClientId: settingRow.linuxdoClientId,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			googleClientId: settingRow.googleClientId,
			googleSwitch: settingRow.googleSwitch,
			minEmailPrefix: settingRow.minEmailPrefix,
			projectLink: settingRow.projectLink
		};
	},

};

export default settingService;
