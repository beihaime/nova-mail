import BizError from '../error/biz-error';

const TRANSACTION_TTL_SECONDS = 600;
const COMPLETE_TTL_SECONDS = 60;

function randomToken(bytes = 32) {
	const value = new Uint8Array(bytes);
	crypto.getRandomValues(value);
	return btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function sha256Base64Url(value) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function cookieName(state) {
	return `__Host-nova-oauth-${state}`;
}

function getCookie(c, name) {
	const header = c.req.header('Cookie') || '';
	for (const part of header.split(';')) {
		const [key, ...value] = part.trim().split('=');
		if (key === name) return value.join('=');
	}
	return null;
}

function cookie(c, state, browserToken, maxAge) {
	c.header('Set-Cookie', `${cookieName(state)}=${browserToken}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
}

const oauthTransactionService = {
	randomToken,
	async ensureTables(c) {
		// Existing installations do not re-run bootstrap migrations. Provision these
		// small, isolated tables lazily so enabling OAuth after an upgrade is safe.
		await c.env.db.batch([
			c.env.db.prepare('CREATE TABLE IF NOT EXISTS oauth_transactions (state TEXT PRIMARY KEY, provider TEXT NOT NULL, intent TEXT NOT NULL, browser_token TEXT NOT NULL, code_verifier TEXT, nonce TEXT, user_id INTEGER, session_token TEXT, expires_at INTEGER NOT NULL)'),
			c.env.db.prepare('CREATE TABLE IF NOT EXISTS oauth_login_grants (grant TEXT PRIMARY KEY, transaction_state TEXT NOT NULL, browser_token TEXT NOT NULL, token TEXT NOT NULL, expires_at INTEGER NOT NULL)')
		]);
	},

	async create(c, { provider, intent = 'login', userId = null, sessionToken = null, usePkce = true }) {
		await this.ensureTables(c);
		const state = randomToken();
		const browserToken = randomToken();
		const verifier = usePkce ? randomToken(48) : null;
		const nonce = randomToken();
		const expiresAt = Date.now() + TRANSACTION_TTL_SECONDS * 1000;
		await c.env.db.prepare(`
			INSERT INTO oauth_transactions (state, provider, intent, browser_token, code_verifier, nonce, user_id, session_token, expires_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(state, provider, intent, browserToken, verifier, nonce, userId, sessionToken, expiresAt).run();
		cookie(c, state, browserToken, TRANSACTION_TTL_SECONDS);
		return { state, verifier, nonce, codeChallenge: verifier ? await sha256Base64Url(verifier) : null };
	},

	async consume(c, provider, state) {
		await this.ensureTables(c);
		if (!state || !/^[A-Za-z0-9_-]{32,128}$/.test(state)) throw new BizError('Invalid OAuth state');
		const browserToken = getCookie(c, cookieName(state));
		if (!browserToken || !/^[A-Za-z0-9_-]{32,128}$/.test(browserToken)) throw new BizError('Invalid OAuth state');
		const transaction = await c.env.db.prepare(`
			DELETE FROM oauth_transactions
			WHERE state = ? AND provider = ? AND browser_token = ? AND expires_at >= ?
			RETURNING *
		`).bind(state, provider, browserToken, Date.now()).first();
		if (!transaction || !['login', 'link'].includes(transaction.intent)) throw new BizError('OAuth state has expired');
		return transaction;
	},

	async createGrant(c, token, state, browserToken) {
		await this.ensureTables(c);
		const grant = randomToken();
		await c.env.db.prepare(`
			INSERT INTO oauth_login_grants (grant, transaction_state, browser_token, token, expires_at)
			VALUES (?, ?, ?, ?, ?)
		`).bind(grant, state, browserToken, token, Date.now() + COMPLETE_TTL_SECONDS * 1000).run();
		// A grant can appear in the callback URL. Bind its redemption to a new
		// HttpOnly browser proof so a stolen grant cannot even consume it.
		cookie(c, grant, browserToken, COMPLETE_TTL_SECONDS);
		return grant;
	},

	async consumeGrant(c, grant) {
		await this.ensureTables(c);
		if (!grant || !/^[A-Za-z0-9_-]{32,128}$/.test(grant)) throw new BizError('OAuth sign-in has expired');
		const browserToken = getCookie(c, cookieName(grant));
		if (!browserToken || !/^[A-Za-z0-9_-]{32,128}$/.test(browserToken)) throw new BizError('OAuth sign-in has expired');
		const grantRow = await c.env.db.prepare(`
			DELETE FROM oauth_login_grants
			WHERE grant = ? AND browser_token = ? AND expires_at >= ?
			RETURNING *
		`).bind(grant, browserToken, Date.now()).first();
		if (!grantRow) throw new BizError('OAuth sign-in has expired');
		cookie(c, grant, '', 0);
		return grantRow.token;
	}
};

export default oauthTransactionService;
