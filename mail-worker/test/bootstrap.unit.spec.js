import { describe, expect, it } from 'vitest';
import { isApplicationInitialized, runBootstrap } from '../src/init/bootstrap';

function createContext(token, db) {
	return {
		env: { BOOTSTRAP_TOKEN: 'a'.repeat(48), db },
		req: { header: (name) => name === 'X-Bootstrap-Token' ? token : undefined },
		text: (body, status = 200) => ({ body, status })
	};
}

function createDatabase({ initialized = false, settingTableExists = true } = {}) {
	let claimed = false;
	return {
		prepare(query) {
			if (query.includes('FROM setting')) {
				return {
					first: async () => {
						if (!settingTableExists) throw new Error('D1_ERROR: no such table: setting');
						return initialized ? { initialized: 1 } : null;
					}
				};
			}
			return {
				bind() {
					return {
						run: async () => {
							claimed = false;
							return { meta: { changes: 1 } };
						}
					};
				}
			};
		},
		batch: async () => {
			const changes = claimed ? 0 : 1;
			claimed = true;
			return [{ meta: { changes: 0 } }, { meta: { changes } }];
		}
	};
}

describe('bootstrap authorization', () => {
	it('treats a missing setting table as a fresh database, but a setting record as authoritative initialization', async () => {
		await expect(isApplicationInitialized(createDatabase({ settingTableExists: false }))).resolves.toBe(false);
		await expect(isApplicationInitialized(createDatabase({ initialized: true }))).resolves.toBe(true);
	});

	it('does not run initialization when the independent bootstrap token is absent or wrong', async () => {
		const db = createDatabase();
		const initialize = async () => {
			throw new Error('must not be called');
		};

		await expect(runBootstrap(createContext(undefined, db), initialize)).resolves.toMatchObject({ status: 404 });
		await expect(runBootstrap(createContext('wrong-token', db), initialize)).resolves.toMatchObject({ status: 404 });
	});

	it('consumes a valid bootstrap token so initialization cannot run twice', async () => {
		const db = createDatabase();
		let calls = 0;
		const initialize = async (c) => {
			calls += 1;
			return c.text('success');
		};

		await expect(runBootstrap(createContext('a'.repeat(48), db), initialize)).resolves.toMatchObject({ status: 200 });
		await expect(runBootstrap(createContext('a'.repeat(48), db), initialize)).resolves.toMatchObject({ status: 409 });
		expect(calls).toBe(1);
	});

	it('rejects a legacy initialized installation that has no bootstrap marker', async () => {
		const db = createDatabase({ initialized: true });
		const initialize = async () => {
			throw new Error('must not be called');
		};

		await expect(runBootstrap(createContext('a'.repeat(48), db), initialize))
			.resolves.toMatchObject({ status: 409 });
	});

	it('allows a fresh database to be claimed only once under repeated requests', async () => {
		const db = createDatabase();
		let calls = 0;
		const initialize = async (c) => {
			calls += 1;
			return c.text('success');
		};

		const responses = await Promise.all([
			runBootstrap(createContext('a'.repeat(48), db), initialize),
			runBootstrap(createContext('a'.repeat(48), db), initialize)
		]);

		expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
		expect(calls).toBe(1);
	});
});
