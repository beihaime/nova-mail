import { defineConfig } from 'vitest/config';

// Local unit tests for pure logic. These run in Node and never touch the Worker
// runtime or D1 — the package's own "test" script deploys a Worker, so it must
// not be used here.
export default defineConfig({
	test: {
		include: [
			'test/security*.spec.js',
			'test/thread*.spec.js',
			'test/mail-body.spec.js',
			'test/web-push.spec.js',
			'test/push-service.spec.js',
		],
		environment: 'node',
	},
});
