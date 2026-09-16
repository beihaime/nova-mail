import BizError from '../error/biz-error';
import KvConst from '../const/kv-const';
import loginService from './login-service';
import userService from './user-service';

const PROVIDER = 'github';
const STATE_TTL_SECONDS = 600;
const COMPLETE_TTL_SECONDS = 60;

function randomToken() {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function loginUrl(c, params = {}) {
	const url = new URL('/login', c.req.url);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	return url.toString();
}

const githubOauthService = {
	config(c) {
		const clientId = c.env.GITHUB_CLIENT_ID;
		const clientSecret = c.env.GITHUB_CLIENT_SECRET;
		if (!clientId || !clientSecret) throw new BizError('GitHub OAuth is not configured');
		return { clientId, clientSecret };
	},

	callbackUrl(c) {
		return new URL('/api/oauth/github/callback', c.req.url).toString();
	},

	authorizeUrl(c, state) {
		const { clientId } = this.config(c);
		const url = new URL('https://github.com/login/oauth/authorize');
		url.searchParams.set('client_id', clientId);
		url.searchParams.set('redirect_uri', this.callbackUrl(c));
		url.searchParams.set('scope', 'read:user');
		url.searchParams.set('state', state);
		return url.toString();
	},

	async saveState(c, value) {
		const state = randomToken();
		await c.env.kv.put(KvConst.OAUTH_GITHUB_STATE + state, JSON.stringify({
			...value,
			expiresAt: Date.now() + STATE_TTL_SECONDS * 1000
		}), { expirationTtl: STATE_TTL_SECONDS });
		return state;
	},

	async startLogin(c) {
		const state = await this.saveState(c, { intent: 'login' });
		return this.authorizeUrl(c, state);
	},

	async startLink(c, userId, sessionToken) {
		if (!sessionToken) throw new BizError('Authentication is required');
		const state = await this.saveState(c, { intent: 'link', userId, sessionToken });
		return this.authorizeUrl(c, state);
	},

	async consumeState(c, state) {
		if (!state || state.length < 32) throw new BizError('Invalid OAuth state');
		const key = KvConst.OAUTH_GITHUB_STATE + state;
		const value = await c.env.kv.get(key, { type: 'json' });
		await c.env.kv.delete(key);
		if (!value || value.expiresAt < Date.now() || !['login', 'link'].includes(value.intent)) {
			throw new BizError('OAuth state has expired');
		}
		return value;
	},

	async getGithubUser(c, code) {
		if (!code) throw new BizError('GitHub did not return an authorization code');
		const { clientId, clientSecret } = this.config(c);
		const body = new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			redirect_uri: this.callbackUrl(c)
		});
		const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST',
			headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
			body
		});
		const token = await tokenResponse.json();
		if (!tokenResponse.ok || token.error || !token.access_token) throw new BizError('GitHub authorization failed');
		const userResponse = await fetch('https://api.github.com/user', {
			headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Nova-Mail' }
		});
		const user = await userResponse.json();
		if (!userResponse.ok || !Number.isInteger(user.id) || !user.login) throw new BizError('Unable to identify the GitHub account');
		return { id: String(user.id), login: user.login, avatarUrl: user.avatar_url || null };
	},

	async findAccount(c, providerUserId) {
		return c.env.db.prepare(`SELECT * FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?`).bind(PROVIDER, providerUserId).first();
	},

	async getConnectedAccount(c, userId) {
		const account = await c.env.db.prepare(`SELECT provider_login, provider_avatar_url FROM oauth_accounts WHERE provider = ? AND user_id = ?`).bind(PROVIDER, userId).first();
		return account ? { connected: true, login: account.provider_login, avatarUrl: account.provider_avatar_url } : { connected: false };
	},

	async assertLinkSession(c, state) {
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + state.userId, { type: 'json' });
		if (!authInfo?.tokens?.includes(state.sessionToken)) throw new BizError('The original session has expired');
		const user = await userService.selectById(c, state.userId);
		if (!user) throw new BizError('Nova Mail account is unavailable');
		return user;
	},

	async link(c, state, githubUser) {
		await this.assertLinkSession(c, state);
		const existing = await this.findAccount(c, githubUser.id);
		if (existing && existing.user_id !== state.userId) throw new BizError('This GitHub account is already linked to another Nova Mail account');
		if (existing) {
			await c.env.db.prepare(`UPDATE oauth_accounts SET provider_login = ?, provider_avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE oauth_account_id = ?`).bind(githubUser.login, githubUser.avatarUrl, existing.oauth_account_id).run();
			return;
		}
		try {
			await c.env.db.prepare(`INSERT INTO oauth_accounts (user_id, provider, provider_user_id, provider_login, provider_avatar_url) VALUES (?, ?, ?, ?, ?)`).bind(state.userId, PROVIDER, githubUser.id, githubUser.login, githubUser.avatarUrl).run();
		} catch (error) {
			if (String(error.message).includes('UNIQUE')) throw new BizError('This GitHub account is already linked to another Nova Mail account');
			throw error;
		}
	},

	async handleCallback(c) {
		let state;
		try {
			if (c.req.query('error')) return loginUrl(c, { github: 'denied' });
			state = await this.consumeState(c, c.req.query('state'));
			const githubUser = await this.getGithubUser(c, c.req.query('code'));
			if (state.intent === 'link') {
				await this.link(c, state, githubUser);
				return new URL('/settings?github=connected', c.req.url).toString();
			}
			const account = await this.findAccount(c, githubUser.id);
			if (!account) return loginUrl(c, { github: 'unlinked' });
			const user = await userService.selectById(c, account.user_id);
			if (!user) return loginUrl(c, { github: 'unlinked' });
			const token = await loginService.createSession(c, user);
			const grant = randomToken();
			await c.env.kv.put(KvConst.OAUTH_GITHUB_COMPLETE + grant, JSON.stringify({ token }), { expirationTtl: COMPLETE_TTL_SECONDS });
			return loginUrl(c, { github: 'complete', grant });
		} catch (error) {
			console.warn('GitHub OAuth callback rejected', { message: error.message });
			return state?.intent === 'link'
				? new URL('/settings?github=failed', c.req.url).toString()
				: loginUrl(c, { github: 'failed' });
		}
	},

	async completeLogin(c, grant) {
		if (!grant || grant.length < 32) throw new BizError('GitHub sign-in has expired');
		const key = KvConst.OAUTH_GITHUB_COMPLETE + grant;
		const result = await c.env.kv.get(key, { type: 'json' });
		await c.env.kv.delete(key);
		if (!result?.token) throw new BizError('GitHub sign-in has expired');
		return { token: result.token };
	},

	async disconnect(c, userId) {
		const user = await userService.selectById(c, userId);
		if (!user?.password) throw new BizError('Set a password before disconnecting GitHub');
		await c.env.db.prepare(`DELETE FROM oauth_accounts WHERE provider = ? AND user_id = ?`).bind(PROVIDER, userId).run();
	}
};

export default githubOauthService;
