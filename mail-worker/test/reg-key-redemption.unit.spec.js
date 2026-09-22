import { describe, expect, it } from 'vitest';
import regKeyService from '../src/service/reg-key-service';

function createDatabase({ count = 1, expired = false, failAccount = false } = {}) {
	const state = { count, expired, users: new Map(), accounts: new Map(), failAccount };
	return {
		state,
		prepare(query) {
			return { query, bind(...args) { return { query, args }; } };
		},
		async batch(statements) {
			const [update, insertUser, insertAccount] = statements;
			const [code] = update.args;
			const snapshot = { count: state.count, users: new Map(state.users), accounts: new Map(state.accounts) };
			const changes = !state.expired && code === 'key' && state.count > 0 ? 1 : 0;
			if (changes) state.count -= 1;
			let userChanges = 0;
			if (changes) {
				const [email] = insertUser.args;
				if (state.users.has(email)) { state.count = snapshot.count; throw new Error('UNIQUE user'); }
				state.users.set(email, { userId: state.users.size + 1, email });
				userChanges = 1;
			}
			let accountChanges = 0;
			if (userChanges) {
				const [, email] = insertAccount.args;
				if (state.failAccount) { state.count = snapshot.count; state.users = snapshot.users; throw new Error('account failed'); }
				state.accounts.set(email, { email });
				accountChanges = 1;
			}
			return [{ meta: { changes } }, { meta: { changes: userChanges } }, { meta: { changes: accountChanges } }];
		}
	};
}

function context(db) {
	return { env: { db: { ...db, prepare(query) {
		if (query.startsWith('SELECT * FROM user')) return { bind(email) { return { first: async () => db.state.users.get(email) || null }; } };
		return db.prepare(query);
	} } } };
}

describe('atomic registration-key redemption', () => {
	it('creates one account and consumes exactly one valid redemption', async () => {
		const db = createDatabase({ count: 1 });
		await expect(regKeyService.redeemAndCreateUser(context(db), { code: 'key', email: 'one@example.com', password: 'hash', salt: 'salt' })).resolves.toMatchObject({ email: 'one@example.com' });
		expect(db.state.count).toBe(0);
	});

	it('does not redeem exhausted or expired keys', async () => {
		for (const options of [{ count: 0 }, { count: 1, expired: true }]) {
			const db = createDatabase(options);
			await expect(regKeyService.redeemAndCreateUser(context(db), { code: 'key', email: 'one@example.com', password: 'hash', salt: 'salt' })).resolves.toBeNull();
			expect(db.state.users.size).toBe(0);
		}
	});

	it('allows only one concurrent final redemption and rolls back a failed account creation', async () => {
		const db = createDatabase({ count: 1 });
		const results = await Promise.all([
			regKeyService.redeemAndCreateUser(context(db), { code: 'key', email: 'one@example.com', password: 'hash', salt: 'salt' }),
			regKeyService.redeemAndCreateUser(context(db), { code: 'key', email: 'two@example.com', password: 'hash', salt: 'salt' })
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
		expect(db.state.count).toBe(0);

		const failing = createDatabase({ count: 1, failAccount: true });
		await expect(regKeyService.redeemAndCreateUser(context(failing), { code: 'key', email: 'one@example.com', password: 'hash', salt: 'salt' })).rejects.toThrow('account failed');
		expect(failing.state.count).toBe(1);
	});
});
