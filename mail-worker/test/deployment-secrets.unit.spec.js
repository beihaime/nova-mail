import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('deployment secret configuration', () => {
	it('never places the JWT signing key in Worker [vars]', () => {
		const config = readFileSync(new URL('../wrangler-action.toml', import.meta.url), 'utf8');
		const workflow = readFileSync(new URL('../../.github/workflows/deploy-cloudflare.yml', import.meta.url), 'utf8');
		expect(config).not.toMatch(/^jwt_secret\s*=/m);
		expect(workflow).toContain('wrangler secret put jwt_secret');
		expect(workflow).not.toContain('s|${JWT_SECRET}|${JWT_SECRET}|g');
	});
});
