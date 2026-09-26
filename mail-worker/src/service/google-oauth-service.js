import BizError from '../error/biz-error';
import KvConst from '../const/kv-const';
import loginService from './login-service';
import userService from './user-service';
import settingService from './setting-service';
import oauthTransactions from './oauth-transaction-service';

const PROVIDER = 'google';
function base64UrlToBytes(value) {
	const normalized = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
	const binary = atob(normalized);
	return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodeJson(value) {
	return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

function loginUrl(c, params = {}) {
	const url = new URL('/login', c.req.url);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	return url.toString();
}

const googleOauthService = {
	async config(c) {
		const setting = await settingService.query(c);
		const clientId = c.env.GOOGLE_CLIENT_ID || setting.googleClientId;
		const clientSecret = c.env.GOOGLE_CLIENT_SECRET || setting.googleClientSecret;
		if (!clientId || !clientSecret) throw new BizError('Google OAuth is not configured');
		if (setting.googleSwitch !== 0) throw new BizError('Google OAuth is disabled');
		return { clientId, clientSecret };
	},

	callbackUrl(c) {
		return new URL('/api/oauth/google/callback', c.req.url).toString();
	},

	async authorizeUrl(c, transaction) {
		const { clientId } = await this.config(c);
		const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
		url.searchParams.set('client_id', clientId);
		url.searchParams.set('redirect_uri', this.callbackUrl(c));
		url.searchParams.set('response_type', 'code');
		url.searchParams.set('scope', 'openid email profile');
		url.searchParams.set('state', transaction.state);
		url.searchParams.set('nonce', transaction.nonce);
		url.searchParams.set('code_challenge', transaction.codeChallenge);
		url.searchParams.set('code_challenge_method', 'S256');
		return url.toString();
	},

	async startLogin(c) {
		return this.authorizeUrl(c, await oauthTransactions.create(c, { provider: PROVIDER }));
	},

	async startLink(c, userId, sessionToken) {
		if (!sessionToken) throw new BizError('Authentication is required');
		return this.authorizeUrl(c, await oauthTransactions.create(c, { provider: PROVIDER, intent: 'link', userId, sessionToken }));
	},

	async consumeState(c, state) {
		const row = await oauthTransactions.consume(c, PROVIDER, state);
		if (!row.nonce || !row.code_verifier) throw new BizError('Invalid OAuth transaction');
		return { intent: row.intent, userId: row.user_id, sessionToken: row.session_token,
			nonce: row.nonce, codeVerifier: row.code_verifier, state: row.state, browserToken: row.browser_token };
	},

	async exchangeCode(c, code, state) {
		if (!code) throw new BizError('Google did not return an authorization code');
		if (!state?.codeVerifier || !/^[A-Za-z0-9_-]{43,128}$/.test(state.codeVerifier)) throw new BizError('Invalid OAuth PKCE transaction');
		const { clientId, clientSecret } = await this.config(c);
		const response = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: this.callbackUrl(c), grant_type: 'authorization_code', code_verifier: state.codeVerifier })
		});
		const token = await response.json();
		if (!response.ok || !token.id_token) throw new BizError('Google authorization failed');
		return token;
	},

	async verifyIdToken(c, idToken, nonce) {
		const parts = String(idToken).split('.');
		if (parts.length !== 3) throw new BizError('Invalid Google identity token');
		const header = decodeJson(parts[0]);
		const claims = decodeJson(parts[1]);
		const { clientId } = await this.config(c);
		const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
		if (header.alg !== 'RS256' || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) || !audiences.includes(clientId) || (claims.azp && claims.azp !== clientId) || claims.nonce !== nonce) {
			throw new BizError('Google identity verification failed');
		}
		if (!claims.sub || claims.exp * 1000 <= Date.now() || (claims.iat && claims.iat * 1000 > Date.now() + 120000)) {
			throw new BizError('Google identity token has expired');
		}
		if (claims.email_verified === false || !claims.email) throw new BizError('Google email is not verified');

		const jwksResponse = await fetch('https://www.googleapis.com/oauth2/v3/certs');
		const jwks = await jwksResponse.json();
		const jwk = (jwks.keys || []).find(key => key.kid === header.kid && key.kty === 'RSA');
		if (!jwk) throw new BizError('Google signing key is unavailable');
		const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
		const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, base64UrlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
		if (!valid) throw new BizError('Google identity signature is invalid');
		return claims;
	},

	async getGoogleUser(c, code, state) {
		const token = await this.exchangeCode(c, code, state);
		const claims = await this.verifyIdToken(c, token.id_token, state.nonce);
		return { id: String(claims.sub), email: claims.email, name: claims.name || claims.email, avatarUrl: claims.picture || null };
	},

	async findAccount(c, providerUserId) {
		const account = await c.env.db.prepare('SELECT * FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?').bind(PROVIDER, providerUserId).first();
		if (account) return account;
		// Migrate a legacy Google OAuth row lazily so existing Google users keep access
		// while all new bindings use the provider-agnostic oauth_accounts table.
		const legacy = await c.env.db.prepare("SELECT user_id, username, name, avatar FROM oauth WHERE platform = 'google' AND oauth_user_id = ? AND user_id > 0").bind(providerUserId).first();
		if (!legacy) return null;
		try {
			await c.env.db.prepare('INSERT INTO oauth_accounts (user_id, provider, provider_user_id, provider_login, provider_avatar_url) VALUES (?, ?, ?, ?, ?)').bind(legacy.user_id, PROVIDER, providerUserId, legacy.username, legacy.avatar).run();
		} catch (error) {
			if (!String(error.message).includes('UNIQUE')) throw error;
		}
		return c.env.db.prepare('SELECT * FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?').bind(PROVIDER, providerUserId).first();
	},

	async getConnectedAccount(c, userId) {
		const account = await c.env.db.prepare('SELECT provider_login, provider_avatar_url FROM oauth_accounts WHERE provider = ? AND user_id = ?').bind(PROVIDER, userId).first();
		return account ? { connected: true, email: account.provider_login, avatarUrl: account.provider_avatar_url } : { connected: false };
	},

	async assertLinkSession(c, state) {
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + state.userId, { type: 'json' });
		if (!authInfo?.tokens?.includes(state.sessionToken)) throw new BizError('The original session has expired');
		const user = await userService.selectById(c, state.userId);
		if (!user) throw new BizError('Nova Mail account is unavailable');
		return user;
	},

	async link(c, state, googleUser) {
		await this.assertLinkSession(c, state);
		const existing = await this.findAccount(c, googleUser.id);
		if (existing && existing.user_id !== state.userId) throw new BizError('This Google account is already linked to another Nova Mail account');
		if (existing) {
			await c.env.db.prepare('UPDATE oauth_accounts SET provider_login = ?, provider_avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE oauth_account_id = ?').bind(googleUser.email, googleUser.avatarUrl, existing.oauth_account_id).run();
			return;
		}
		try {
			await c.env.db.prepare('INSERT INTO oauth_accounts (user_id, provider, provider_user_id, provider_login, provider_avatar_url) VALUES (?, ?, ?, ?, ?)').bind(state.userId, PROVIDER, googleUser.id, googleUser.email, googleUser.avatarUrl).run();
		} catch (error) {
			if (String(error.message).includes('UNIQUE')) throw new BizError('This Google account is already linked to another Nova Mail account');
			throw error;
		}
	},

	async handleCallback(c) {
		let state;
		try {
			state = await this.consumeState(c, c.req.query('state'));
			if (c.req.query('error')) {
				return state.intent === 'link' ? new URL('/settings?google=denied', c.req.url).toString() : loginUrl(c, { google: 'denied' });
			}
			const googleUser = await this.getGoogleUser(c, c.req.query('code'), state);
			if (state.intent === 'link') {
				await this.link(c, state, googleUser);
				return new URL('/settings?google=connected', c.req.url).toString();
			}
			const account = await this.findAccount(c, googleUser.id);
			if (!account) return loginUrl(c, { google: 'unlinked' });
			const user = await userService.selectById(c, account.user_id);
			if (!user) return loginUrl(c, { google: 'unlinked' });
			const token = await loginService.createSession(c, user);
			const grant = await oauthTransactions.createGrant(c, token, state.state, state.browserToken);
			return loginUrl(c, { google: 'complete', grant });
		} catch (error) {
			console.warn('Google OAuth callback rejected', { message: error.message });
			return state?.intent === 'link' ? new URL('/settings?google=failed', c.req.url).toString() : loginUrl(c, { google: 'failed' });
		}
	},

	async completeLogin(c, grant) {
		return { token: await oauthTransactions.consumeGrant(c, grant) };
	},

	async disconnect(c, userId) {
		const user = await userService.selectById(c, userId);
		if (!user?.password) throw new BizError('Set a password before disconnecting Google');
		await c.env.db.prepare('DELETE FROM oauth_accounts WHERE provider = ? AND user_id = ?').bind(PROVIDER, userId).run();
	}
};

export default googleOauthService;
