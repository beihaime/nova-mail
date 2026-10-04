import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	BOOTSTRAP_HEADER,
	BOOTSTRAP_PATH,
	classifyBootstrapResponse,
	readBoundedText,
	runBootstrap,
	sanitizeBody,
} from '../scripts/bootstrap-database.mjs';

/**
 * Guards the deployment bootstrap decision.
 *
 * The downstream failure this covers: an *existing* installation had its schema
 * migrated and verified, the workflow then POSTed to `/api/bootstrap` on the
 * custom domain, and Cloudflare's edge answered 403 before the Worker saw the
 * request. The workflow printed a bare `Bootstrap failed. HTTP: 403`, which
 * looked exactly like a token problem. The Worker itself can only answer the
 * route with 200 / 404 / 409.
 */

const TOKEN = 'bootstrap-token-value-that-is-long-enough';
const CUSTOM = 'https://mail.example.test';
const WORKERS_DEV = 'https://mail.example.workers.dev';

function fakeResponse({ status = 200, body = '', headers = {} } = {}) {
	const lookup = Object.fromEntries(
		Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]),
	);
	return {
		status,
		headers: { get: (name) => lookup[String(name).toLowerCase()] ?? null },
		text: async () => body,
	};
}

const workerSuccess = () => fakeResponse({
	status: 200,
	body: 'success',
	headers: { 'content-type': 'text/plain; charset=UTF-8' },
});
const workerNotFound = () => fakeResponse({
	status: 404,
	body: 'Not found',
	headers: { 'content-type': 'text/plain; charset=UTF-8' },
});
const workerAlreadyInitialized = () => fakeResponse({
	status: 409,
	body: 'Bootstrap has already been completed',
	headers: { 'content-type': 'text/plain; charset=UTF-8' },
});
const edgeChallenge = (extra = {}) => fakeResponse({
	status: 403,
	body: '<html><head><title>Just a moment...</title></head><body>Enable JavaScript and cookies to continue</body></html>',
	headers: { 'content-type': 'text/html; charset=UTF-8', server: 'cloudflare', 'cf-mitigated': 'challenge', 'cf-ray': 'a4550dc0ed2910a3-HKG' },
	...extra,
});

function collector() {
	const lines = [];
	return { lines, log: (...args) => lines.push(args.join(' ')), errorLog: (...args) => lines.push(args.join(' ')) };
}

describe('bootstrap-database runner', () => {
	it('does not call /api/bootstrap for an existing initialized database', async () => {
		let called = 0;
		const out = collector();

		const result = await runBootstrap({
			newDatabase: false,
			baseUrl: CUSTOM,
			fallbackUrl: WORKERS_DEV,
			token: TOKEN,
			fetchImpl: async () => { called += 1; return workerNotFound(); },
			...out,
		});

		expect(result).toEqual({ ok: true, skipped: true });
		expect(called).toBe(0);
		expect(out.lines.join('\n')).toContain('not called');
	});

	it('does not fail an existing install when BOOTSTRAP_TOKEN is unset', async () => {
		let called = 0;
		const out = collector();

		const result = await runBootstrap({
			newDatabase: false,
			baseUrl: CUSTOM,
			token: '',
			fetchImpl: async () => { called += 1; },
			...out,
		});

		expect(result.ok).toBe(true);
		expect(called).toBe(0);
		expect(out.lines.join('\n')).not.toContain('❌');
	});

	it('initializes a first-time database with the correct token', async () => {
		const out = collector();
		const seen = [];

		const result = await runBootstrap({
			newDatabase: true,
			baseUrl: CUSTOM,
			fallbackUrl: WORKERS_DEV,
			token: TOKEN,
			fetchImpl: async (url, init) => {
				seen.push({ url, method: init.method, token: init.headers[BOOTSTRAP_HEADER], redirect: init.redirect });
				return workerSuccess();
			},
			...out,
		});

		expect(result.ok).toBe(true);
		expect(seen).toEqual([{ url: `${CUSTOM}${BOOTSTRAP_PATH}`, method: 'POST', token: TOKEN, redirect: 'manual' }]);
		expect(out.lines.join('\n')).toContain('New database initialized');
	});

	it('treats 409 as an already completed bootstrap', async () => {
		const out = collector();
		const result = await runBootstrap({
			newDatabase: true,
			baseUrl: CUSTOM,
			token: TOKEN,
			fetchImpl: async () => workerAlreadyInitialized(),
			...out,
		});

		expect(result.ok).toBe(true);
		expect(out.lines.join('\n')).toContain('already initialized');
	});

	it('shows a safe 404 diagnostic for a wrong token and never prints the token', async () => {
		const out = collector();
		const result = await runBootstrap({
			newDatabase: true,
			baseUrl: CUSTOM,
			token: TOKEN,
			fetchImpl: async () => workerNotFound(),
			...out,
		});

		const report = out.lines.join('\n');
		expect(result.ok).toBe(false);
		expect(report).toContain('Nova Mail rejected the bootstrap request');
		expect(report).toContain('HTTP 404');
		expect(report).toContain('X-Bootstrap-Token');
		expect(report).toContain('Not found');
		expect(report).not.toContain(TOKEN);
	});

	it('names a Cloudflare edge 403 as distinct from a Nova Mail rejection', async () => {
		const out = collector();
		const result = await runBootstrap({
			newDatabase: true,
			baseUrl: CUSTOM,
			token: TOKEN,
			fetchImpl: async () => edgeChallenge(),
			...out,
		});

		const report = out.lines.join('\n');
		expect(result.ok).toBe(false);
		expect(report).toContain('Cloudflare edge answered the bootstrap request');
		expect(report).toContain('never reached the Nova Mail Worker');
		expect(report).toContain('cf-mitigated=challenge');
		expect(report).toContain('cf-ray=');
		expect(report).not.toContain('Nova Mail rejected');
		expect(report).not.toContain(TOKEN);
	});

	it('retries over the workers.dev URL when the custom domain is edge-blocked', async () => {
		const out = collector();
		const seen = [];
		const result = await runBootstrap({
			newDatabase: true,
			baseUrl: CUSTOM,
			fallbackUrl: WORKERS_DEV,
			token: TOKEN,
			fetchImpl: async (url) => {
				seen.push(url);
				return url.startsWith(WORKERS_DEV) ? workerSuccess() : edgeChallenge();
			},
			...out,
		});

		expect(result.ok).toBe(true);
		expect(seen).toEqual([`${CUSTOM}${BOOTSTRAP_PATH}`, `${WORKERS_DEV}${BOOTSTRAP_PATH}`]);
		expect(out.lines.join('\n')).toContain('retrying over the workers.dev URL');
	});

	it('fails closed when a first-time database has no token', async () => {
		let called = 0;
		const out = collector();
		const result = await runBootstrap({
			newDatabase: true,
			baseUrl: CUSTOM,
			token: '',
			fetchImpl: async () => { called += 1; },
			...out,
		});

		expect(result).toEqual({ ok: false, reason: 'missing-token' });
		expect(called).toBe(0);
		expect(out.lines.join('\n')).toContain('BOOTSTRAP_TOKEN is missing');
	});

	it('bounds the diagnostic body', async () => {
		const out = collector();
		await runBootstrap({
			newDatabase: true,
			baseUrl: CUSTOM,
			token: TOKEN,
			fetchImpl: async () => edgeChallenge({ body: `<html>${'x'.repeat(5000)}</html>` }),
			...out,
		});

		const bodyLine = out.lines.find((line) => line.includes('edge body:')) || '';
		expect(bodyLine.length).toBeLessThan(500);
	});
});

describe('bootstrap response classification and body handling', () => {
	it('classifies the Worker statuses and an edge page', () => {
		expect(classifyBootstrapResponse({ status: 200, body: 'success' })).toBe('ok');
		expect(classifyBootstrapResponse({ status: 409, body: 'Bootstrap has already been completed' })).toBe('already-initialized');
		expect(classifyBootstrapResponse({ status: 404, contentType: 'text/plain', body: 'Not found' })).toBe('worker-error');
		expect(classifyBootstrapResponse({ status: 403, contentType: 'text/html', server: 'cloudflare', body: '<html></html>' })).toBe('edge');
		expect(classifyBootstrapResponse({ status: 403, contentType: 'application/json', server: 'cloudflare', body: '{}' })).toBe('worker-error');
		expect(classifyBootstrapResponse({ status: 503, contentType: 'text/html', cfMitigated: 'challenge', body: '' })).toBe('edge');
	});

	it('collapses and truncates a body', () => {
		expect(sanitizeBody('\n  <html>\n   <body>  hi </body> </html> ')).toBe('<html> <body> hi </body> </html>');
		expect(sanitizeBody('y'.repeat(2000)).length).toBeLessThanOrEqual(401);
	});

	it('reads at most maxBytes from a real Response stream', async () => {
		const response = new Response('z'.repeat(10000), { headers: { 'content-type': 'text/plain' } });
		const text = await readBoundedText(response, 128);
		expect(text.length).toBe(128);
	});
});

describe('bootstrap deployment wiring', () => {
	const workflow = readFileSync(new URL('../../.github/workflows/deploy-cloudflare.yml', import.meta.url), 'utf8');
	const bootstrapSource = readFileSync(new URL('../src/init/bootstrap.js', import.meta.url), 'utf8');
	const initApiSource = readFileSync(new URL('../src/api/init-api.js', import.meta.url), 'utf8');

	it('decides from the existing-schema step instead of always calling the endpoint', () => {
		expect(workflow).toContain('id: schema');
		expect(workflow).toContain('new_database=true');
		expect(workflow).toContain('new_database=false');
		expect(workflow).toContain('node scripts/bootstrap-database.mjs --new-database "$NEW_DATABASE"');
		// The old unconditional curl and its bare status message are gone.
		expect(workflow).not.toContain('-H "X-Bootstrap-Token: $BOOTSTRAP_TOKEN"');
		expect(workflow).not.toContain('Bootstrap failed. HTTP:');
	});

	it('only uploads the bootstrap secret for a first-time database', () => {
		expect(workflow).toContain("if: steps.schema.outputs.new_database == 'true'");
		expect(workflow).toContain('pnpm wrangler secret put BOOTSTRAP_TOKEN -c wrangler-action.toml');
	});

	it('keeps the Worker endpoint method, path and header names aligned', () => {
		expect(initApiSource).toContain("app.post('/bootstrap'");
		expect(BOOTSTRAP_PATH).toBe('/api/bootstrap');
		expect(BOOTSTRAP_HEADER.toLowerCase()).toBe('x-bootstrap-token');
		expect(bootstrapSource.toLowerCase()).toContain("c.req.header('x-bootstrap-token')");
		// Secret binding name matches what the workflow uploads and the Worker reads.
		expect(bootstrapSource).toContain('c.env.BOOTSTRAP_TOKEN');
		expect(workflow).toContain('BOOTSTRAP_TOKEN: ${{ secrets.BOOTSTRAP_TOKEN }}');
	});

	it('never echoes BOOTSTRAP_TOKEN', () => {
		expect(workflow).not.toMatch(/echo[^\n]*\$\{?BOOTSTRAP_TOKEN/);
		expect(workflow).not.toMatch(/set -x/);
	});
});
