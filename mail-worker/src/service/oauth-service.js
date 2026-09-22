import BizError from '../error/biz-error';
import orm from '../entity/orm';
import { oauth } from '../entity/oauth';
import { eq, inArray } from 'drizzle-orm';
import userService from './user-service';
import loginService from './login-service';
import settingService from './setting-service';
import oauthTransactions from './oauth-transaction-service';
import KvConst from '../const/kv-const';

const PROVIDERS = {
	google: {
		switchKey: 'googleSwitch', clientId: 'googleClientId', clientSecret: 'googleClientSecret',
		authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth', tokenEndpoint: 'https://oauth2.googleapis.com/token',
		scope: 'openid profile email', oidc: true
	},
	linuxdo: {
		switchKey: 'linuxdoSwitch', clientId: 'linuxdoClientId', clientSecret: 'linuxdoClientSecret',
		authorizeEndpoint: 'https://connect.linux.do/oauth2/authorize', tokenEndpoint: 'https://connect.linux.do/oauth2/token',
		// This is an OAuth profile API, not an unverified ID-token assertion.
		scope: 'profile email', oidc: false
	}
};

function loginUrl(c, params = {}) {
	const url = new URL('/login', c.req.url);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	return url.toString();
}

const oauthService = {
	callbackUrl(c, provider) {
		if (!PROVIDERS[provider]) throw new BizError('Unknown OAuth provider');
		return new URL(`/api/oauth/${provider}/callback`, c.req.url).toString();
	},

	async config(c, provider) {
		const definition = PROVIDERS[provider];
		if (!definition) throw new BizError('Unknown OAuth provider');
		const setting = await settingService.query(c);
		if (setting[definition.switchKey] !== 0) throw new BizError('OAuth provider is disabled');
		const clientId = setting[definition.clientId];
		const clientSecret = setting[definition.clientSecret];
		if (!clientId || !clientSecret) throw new BizError('OAuth provider is not configured');
		return { ...definition, clientId, clientSecret };
	},

	async authorizeUrl(c, provider, transaction) {
		const config = await this.config(c, provider);
		const url = new URL(config.authorizeEndpoint);
		url.searchParams.set('client_id', config.clientId);
		url.searchParams.set('redirect_uri', this.callbackUrl(c, provider));
		url.searchParams.set('response_type', 'code');
		url.searchParams.set('scope', config.scope);
		url.searchParams.set('state', transaction.state);
		url.searchParams.set('code_challenge', transaction.codeChallenge);
		url.searchParams.set('code_challenge_method', 'S256');
		if (config.oidc) url.searchParams.set('nonce', transaction.nonce);
		return url.toString();
	},

	async startLogin(c, provider) {
		return this.authorizeUrl(c, provider, await oauthTransactions.create(c, { provider }));
	},

	async startLink(c, provider, userId, sessionToken) {
		if (!sessionToken) throw new BizError('Authentication is required');
		return this.authorizeUrl(c, provider, await oauthTransactions.create(c, { provider, intent: 'link', userId, sessionToken }));
	},

	async exchangeCode(c, provider, code, transaction) {
		if (!code || typeof code !== 'string' || code.length > 2048) throw new BizError('OAuth provider did not return an authorization code');
		if (!transaction?.code_verifier || !/^[A-Za-z0-9_-]{43,128}$/.test(transaction.code_verifier)) throw new BizError('Invalid OAuth PKCE transaction');
		const config = await this.config(c, provider);
		const body = new URLSearchParams({
			client_id: config.clientId, client_secret: config.clientSecret, code,
			redirect_uri: this.callbackUrl(c, provider), grant_type: 'authorization_code',
			code_verifier: transaction.code_verifier
		});
		const response = await fetch(config.tokenEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
		const token = await response.json().catch(() => null);
		if (!response.ok || !token?.access_token) throw new BizError('OAuth authorization failed');
		return { config, token };
	},

	async googleIdentity(token, transaction, config) {
		if (!token.id_token) throw new BizError('Google did not return an ID token');
		// Google's fixed tokeninfo endpoint verifies the signature. Claims are still
		// checked here; decoding a JWT locally is never treated as verification.
		const verifiedResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token.id_token)}`);
		const claims = await verifiedResponse.json().catch(() => null);
		const expiry = Number(claims?.exp) * 1000;
		if (!verifiedResponse.ok || !claims?.sub || claims.aud !== config.clientId ||
			!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
			claims.nonce !== transaction.nonce || !Number.isFinite(expiry) || expiry <= Date.now()) throw new BizError('Invalid Google identity token');
		const userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
		const user = await userResponse.json().catch(() => null);
		if (!userResponse.ok || !user?.sub || String(user.sub) !== String(claims.sub)) throw new BizError('Unable to identify the Google account');
		return { id: String(claims.sub), login: user.email || claims.email || null, avatarUrl: user.picture || null };
	},

	async linuxdoIdentity(token) {
		const response = await fetch('https://connect.linux.do/api/user', { headers: { Authorization: `Bearer ${token.access_token}` } });
		const user = await response.json().catch(() => null);
		if (!response.ok || user?.id == null) throw new BizError('Unable to identify the LinuxDo account');
		return { id: String(user.id), login: user.username || user.email || null, avatarUrl: user.avatar_url || null };
	},

	async findAccount(c, provider, providerUserId) {
		return c.env.db.prepare('SELECT * FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?').bind(provider, providerUserId).first();
	},

	async importLegacyAccount(c, provider, providerUserId) {
		const legacy = await c.env.db.prepare('SELECT * FROM oauth WHERE platform = ? AND oauth_user_id = ? AND user_id > 0').bind(provider, providerUserId).first();
		if (!legacy) return null;
		try { await c.env.db.prepare('INSERT INTO oauth_accounts (user_id, provider, provider_user_id, provider_login, provider_avatar_url) VALUES (?, ?, ?, ?, ?)').bind(legacy.user_id, provider, providerUserId, legacy.username || null, legacy.avatar || null).run(); }
		catch (error) { if (!String(error.message).includes('UNIQUE')) throw error; }
		return this.findAccount(c, provider, providerUserId);
	},

	async assertLinkSession(c, transaction) {
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + transaction.user_id, { type: 'json' });
		if (!authInfo?.tokens?.includes(transaction.session_token)) throw new BizError('The original session has expired');
		const user = await userService.selectById(c, transaction.user_id);
		if (!user) throw new BizError('Nova Mail account is unavailable');
		return user;
	},

	async link(c, provider, transaction, identity) {
		await this.assertLinkSession(c, transaction);
		const existing = await this.findAccount(c, provider, identity.id);
		if (existing && existing.user_id !== transaction.user_id) throw new BizError('This OAuth account is already linked to another Nova Mail account');
		if (existing) {
			await c.env.db.prepare('UPDATE oauth_accounts SET provider_login = ?, provider_avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE oauth_account_id = ?').bind(identity.login, identity.avatarUrl, existing.oauth_account_id).run();
			return;
		}
		try { await c.env.db.prepare('INSERT INTO oauth_accounts (user_id, provider, provider_user_id, provider_login, provider_avatar_url) VALUES (?, ?, ?, ?, ?)').bind(transaction.user_id, provider, identity.id, identity.login, identity.avatarUrl).run(); }
		catch (error) { if (String(error.message).includes('UNIQUE')) throw new BizError('This OAuth account is already linked to another Nova Mail account'); throw error; }
	},

	async handleCallback(c, provider) {
		let transaction;
		try {
			if (c.req.query('error')) return loginUrl(c, { oauth: 'denied' });
			transaction = await oauthTransactions.consume(c, provider, c.req.query('state'));
			const { config, token } = await this.exchangeCode(c, provider, c.req.query('code'), transaction);
			const identity = provider === 'google' ? await this.googleIdentity(token, transaction, config) : await this.linuxdoIdentity(token);
			if (transaction.intent === 'link') {
				await this.link(c, provider, transaction, identity);
				return new URL(`/settings?${provider}=connected`, c.req.url).toString();
			}
			let account = await this.findAccount(c, provider, identity.id);
			if (!account) account = await this.importLegacyAccount(c, provider, identity.id);
			if (!account) return loginUrl(c, { oauth: 'unlinked' });
			const user = await userService.selectById(c, account.user_id);
			if (!user) return loginUrl(c, { oauth: 'unlinked' });
			const jwt = await loginService.createSession(c, user);
			const grant = await oauthTransactions.createGrant(c, jwt, transaction.state, transaction.browser_token);
			return loginUrl(c, { oauth: 'complete', grant });
		} catch (error) {
			console.warn('OAuth callback rejected', { provider, message: error.message });
			return transaction?.intent === 'link' ? new URL(`/settings?${provider}=failed`, c.req.url).toString() : loginUrl(c, { oauth: 'failed' });
		}
	},

	async completeLogin(c, grant) { return { token: await oauthTransactions.consumeGrant(c, grant) }; },
	async deleteByUserId(c, userId) { await this.deleteByUserIds(c, [userId]); },
	async deleteByUserIds(c, userIds) {
		await orm(c).delete(oauth).where(inArray(oauth.userId, userIds)).run();
		if (userIds.length) {
			try { await c.env.db.prepare(`DELETE FROM oauth_accounts WHERE user_id IN (${userIds.map(() => '?').join(',')})`).bind(...userIds).run(); }
			catch (error) { if (!String(error.message).includes('no such table')) throw error; }
		}
	},
	async clearNoBindOathUser(c) { await orm(c).delete(oauth).where(eq(oauth.userId, 0)).run(); }
};

export default oauthService;
