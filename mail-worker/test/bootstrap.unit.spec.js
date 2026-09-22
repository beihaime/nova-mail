import { describe, expect, it } from 'vitest';
import { runBootstrap } from '../src/init/bootstrap';

function createContext(token, db) {
	return {
		env: { BOOTSTRAP_TOKEN: 'a'.repeat(48), db },
		req: { header: (name) => name === 'X-Bootstrap-Token' ? token : undefined },
		text: (body, status = 200) => ({ body, status })
	};
}

function createDatabase() {
	let claimed = false;
	return {
		prepare(query) {
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
});
