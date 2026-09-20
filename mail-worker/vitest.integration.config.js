import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// Integration tests: the real Worker runs inside workerd with local D1/KV/R2
// bindings, so `SELF.fetch(...)` exercises routing, middleware, auth and SQL
// together. Only files under `test/integration/` are picked up; the pure-logic
// suites stay on the fast Node pool via `vitest.unit.config.js`.
export default defineWorkersConfig({
	test: {
		include: ['test/integration/**/*.spec.js'],
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.vitest.toml' },
				// One worker for the whole run keeps the D1 schema (created once in
				// the setup file) available to every suite.
				singleWorker: true,
				isolatedStorage: false,
				miniflare: {
					// Outbound mail/OAuth must never escape the test run.
					bindings: {},
				},
			},
		},
		setupFiles: ['./test/integration/setup.js'],
	},
});
