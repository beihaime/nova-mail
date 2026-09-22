import { describe, expect, it } from 'vitest';
import oauthTransactions from '../src/service/oauth-transaction-service';

function createDatabase() {
	const transactions = new Map();
	const grants = new Map();
	return {
		transactions,
		batch: async () => [],
		prepare(query) {
			return {
				bind(...args) {
					return {
						run: async () => {
							if (query.includes('INSERT INTO oauth_transactions')) {
								const [state, provider, intent, browser_token, code_verifier, nonce, user_id, session_token, expires_at] = args;
								transactions.set(state, { state, provider, intent, browser_token, code_verifier, nonce, user_id, session_token, expires_at });
							}
							if (query.includes('INSERT INTO oauth_login_grants')) {
								const [grant, transaction_state, browser_token, token, expires_at] = args;
								grants.set(grant, { grant, transaction_state, browser_token, token, expires_at });
							}
							return { meta: { changes: 1 } };
						},
						first: async () => {
							if (query.includes('DELETE FROM oauth_transactions')) {
								const [state, provider, browserToken, now] = args;
								const row = transactions.get(state);
								if (!row || row.provider !== provider || row.browser_token !== browserToken || row.expires_at < now) return null;
								transactions.delete(state);
								return row;
							}
							if (query.includes('DELETE FROM oauth_login_grants')) {
								const [grant, browserToken, now] = args;
								const row = grants.get(grant);
								if (!row || row.browser_token !== browserToken || row.expires_at < now) return null;
								grants.delete(grant);
								return row;
							}
							return null;
						}
					};
				}
			};
		}
	};
}

function createContext(db, cookies = '') {
	const headers = new Map();
	return {
		env: { db },
		req: { header: name => name === 'Cookie' ? cookies : undefined },
		header: (name, value) => headers.set(name, value),
		headers
	};
}

function cookieFrom(context) {
	return context.headers.get('Set-Cookie').split(';')[0];
}

describe('OAuth authorization transactions', () => {
	it('uses a high-entropy PKCE verifier and atomically consumes a valid browser-bound transaction', async () => {
		const db = createDatabase();
		const start = createContext(db);
		const transaction = await oauthTransactions.create(start, { provider: 'google' });
		expect(transaction.state).toMatch(/^[A-Za-z0-9_-]{32,}$/);
		expect(transaction.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
		expect(transaction.codeChallenge).toMatch(/^[A-Za-z0-9_-]{32,}$/);
		const callback = createContext(db, cookieFrom(start));
		await expect(oauthTransactions.consume(callback, 'google', transaction.state)).resolves.toMatchObject({ state: transaction.state, provider: 'google' });
		await expect(oauthTransactions.consume(callback, 'google', transaction.state)).rejects.toThrow('OAuth state');
	});

	it('rejects missing, wrong-provider, wrong-browser, expired, and malformed state values', async () => {
		const db = createDatabase();
		const start = createContext(db);
		const transaction = await oauthTransactions.create(start, { provider: 'google' });
		await expect(oauthTransactions.consume(createContext(db, cookieFrom(start)), 'google')).rejects.toThrow('OAuth state');
		await expect(oauthTransactions.consume(createContext(db, cookieFrom(start)), 'linuxdo', transaction.state)).rejects.toThrow('OAuth state');
		await expect(oauthTransactions.consume(createContext(db, '__Host-nova-oauth-x=attacker'), 'google', transaction.state)).rejects.toThrow('OAuth state');
		const expired = await oauthTransactions.create(createContext(db), { provider: 'google' });
		db.transactions.get(expired.state).expires_at = Date.now() - 1;
		await expect(oauthTransactions.consume(createContext(db, `__Host-nova-oauth-${expired.state}=${db.transactions.get(expired.state).browser_token}`), 'google', expired.state)).rejects.toThrow('OAuth state');
	});

	it('requires the same initiating browser to redeem a one-time completion grant', async () => {
		const db = createDatabase();
		const start = createContext(db);
		const transaction = await oauthTransactions.create(start, { provider: 'github' });
		const grant = await oauthTransactions.createGrant(start, 'session-token', transaction.state, db.transactions.get(transaction.state).browser_token);
		const completionCookie = cookieFrom(start);
		await expect(oauthTransactions.consumeGrant(createContext(db, completionCookie), grant)).resolves.toBe('session-token');
		await expect(oauthTransactions.consumeGrant(createContext(db, completionCookie), grant)).rejects.toThrow('OAuth sign-in');
	});
});
