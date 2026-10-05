import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SPA_CSP, withSpaCsp } from '../src/security/spa-csp';

describe('SPA Content-Security-Policy', () => {
	it('allows only the fixed first-paint inline script', () => {
		const path = fileURLToPath(new URL('../../mail-vue/index.html', import.meta.url));
		const html = readFileSync(path, 'utf8');
		const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
			.map(match => match[1]).filter(Boolean);
		expect(inline).toHaveLength(1);
		const hash = createHash('sha256').update(inline[0]).digest('base64');
		expect(SPA_CSP).toContain(`'sha256-${hash}'`);
		expect(SPA_CSP).not.toContain("'unsafe-inline' https://challenges.cloudflare.com");
	});

	it('permits the GitHub release API used by the shared app-version source', () => {
		expect(SPA_CSP).toContain("connect-src 'self' https://challenges.cloudflare.com https://api.github.com");
	});

	it('sets CSP on HTML assets without altering other assets', async () => {
		const html = withSpaCsp(new Response('<html></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
		expect(html.headers.get('Content-Security-Policy')).toBe(SPA_CSP);
		expect(await html.text()).toBe('<html></html>');
		const javascript = new Response('export {}', { headers: { 'Content-Type': 'text/javascript' } });
		expect(withSpaCsp(javascript)).toBe(javascript);
	});
});
