import BizError from '../error/biz-error';
import loginService from './login-service';
import userService from './user-service';
import oauthTransactions from './oauth-transaction-service';
import KvConst from '../const/kv-const';

const PROVIDER = 'github';

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
	callbackUrl(c) { return new URL('/api/oauth/github/callback', c.req.url).toString(); },

	authorizeUrl(c, transaction) {
		const { clientId } = this.config(c);
		const url = new URL('https://github.com/login/oauth/authorize');
		url.searchParams.set('client_id', clientId);
		url.searchParams.set('redirect_uri', this.callbackUrl(c));
		url.searchParams.set('scope', 'read:user');
		url.searchParams.set('state', transaction.state);
		url.searchParams.set('code_challenge', transaction.codeChallenge);
		url.searchParams.set('code_challenge_method', 'S256');
		return url.toString();
	},

	async startLogin(c) { return this.authorizeUrl(c, await oauthTransactions.create(c, { provider: PROVIDER })); },
	async startLink(c, userId, sessionToken) {
		if (!sessionToken) throw new BizError('Authentication is required');
		return this.authorizeUrl(c, await oauthTransactions.create(c, { provider: PROVIDER, intent: 'link', userId, sessionToken }));
	},

	async getGithubUser(c, code, transaction) {
		if (!code || typeof code !== 'string' || code.length > 2048) throw new BizError('GitHub did not return an authorization code');
		if (!transaction?.code_verifier || !/^[A-Za-z0-9_-]{43,128}$/.test(transaction.code_verifier)) throw new BizError('Invalid OAuth PKCE transaction');
		const { clientId, clientSecret } = this.config(c);
		const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: this.callbackUrl(c), code_verifier: transaction.code_verifier });
		const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body });
		const token = await tokenResponse.json().catch(() => null);
		if (!tokenResponse.ok || token?.error || !token?.access_token) throw new BizError('GitHub authorization failed');
		const userResponse = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Nova-Mail' } });
		const user = await userResponse.json().catch(() => null);
		if (!userResponse.ok || !Number.isInteger(user?.id) || !user.login) throw new BizError('Unable to identify the GitHub account');
		return { id: String(user.id), login: user.login, avatarUrl: user.avatar_url || null };
	},

	async findAccount(c, providerUserId) { return c.env.db.prepare('SELECT * FROM oauth_accounts WHERE provider = ? AND provider_user_id = ?').bind(PROVIDER, providerUserId).first(); },
	async getConnectedAccount(c, userId) {
		const account = await c.env.db.prepare('SELECT provider_login, provider_avatar_url FROM oauth_accounts WHERE provider = ? AND user_id = ?').bind(PROVIDER, userId).first();
		return account ? { connected: true, login: account.provider_login, avatarUrl: account.provider_avatar_url } : { connected: false };
	},

	async assertLinkSession(c, transaction) {
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + transaction.user_id, { type: 'json' });
		if (!authInfo?.tokens?.includes(transaction.session_token)) throw new BizError('The original session has expired');
		const user = await userService.selectById(c, transaction.user_id);
		if (!user) throw new BizError('Nova Mail account is unavailable');
	},
	async link(c, transaction, githubUser) {
		await this.assertLinkSession(c, transaction);
		const existing = await this.findAccount(c, githubUser.id);
		if (existing && existing.user_id !== transaction.user_id) throw new BizError('This GitHub account is already linked to another Nova Mail account');
		if (existing) {
			await c.env.db.prepare('UPDATE oauth_accounts SET provider_login = ?, provider_avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE oauth_account_id = ?').bind(githubUser.login, githubUser.avatarUrl, existing.oauth_account_id).run();
			return;
		}
		try { await c.env.db.prepare('INSERT INTO oauth_accounts (user_id, provider, provider_user_id, provider_login, provider_avatar_url) VALUES (?, ?, ?, ?, ?)').bind(transaction.user_id, PROVIDER, githubUser.id, githubUser.login, githubUser.avatarUrl).run(); }
		catch (error) { if (String(error.message).includes('UNIQUE')) throw new BizError('This GitHub account is already linked to another Nova Mail account'); throw error; }
	},

	async handleCallback(c) {
		let transaction;
		try {
			if (c.req.query('error')) return loginUrl(c, { github: 'denied' });
			transaction = await oauthTransactions.consume(c, PROVIDER, c.req.query('state'));
			const githubUser = await this.getGithubUser(c, c.req.query('code'), transaction);
			if (transaction.intent === 'link') { await this.link(c, transaction, githubUser); return new URL('/settings?github=connected', c.req.url).toString(); }
			const account = await this.findAccount(c, githubUser.id);
			if (!account) return loginUrl(c, { github: 'unlinked' });
			const user = await userService.selectById(c, account.user_id);
			if (!user) return loginUrl(c, { github: 'unlinked' });
			const token = await loginService.createSession(c, user);
			const grant = await oauthTransactions.createGrant(c, token, transaction.state, transaction.browser_token);
			return loginUrl(c, { github: 'complete', grant });
		} catch (error) {
			console.warn('GitHub OAuth callback rejected', { message: error.message });
			return transaction?.intent === 'link' ? new URL('/settings?github=failed', c.req.url).toString() : loginUrl(c, { github: 'failed' });
		}
	},

	async completeLogin(c, grant) { return { token: await oauthTransactions.consumeGrant(c, grant) }; },
	async disconnect(c, userId) {
		const user = await userService.selectById(c, userId);
		if (!user?.password) throw new BizError('Set a password before disconnecting GitHub');
		await c.env.db.prepare('DELETE FROM oauth_accounts WHERE provider = ? AND user_id = ?').bind(PROVIDER, userId).run();
	}
};

export default githubOauthService;
