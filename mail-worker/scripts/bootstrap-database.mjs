#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

/**
 * Deployment bootstrap step for the one-time `/api/bootstrap` endpoint.
 *
 * Background: the old workflow POSTed to `/api/bootstrap` on *every* deploy,
 * including existing installations, using the custom domain. The Worker only
 * ever answers that route with 200 / 404 / 409, so a `403` seen in CI comes
 * from something in front of the Worker (Cloudflare WAF / bot protection /
 * Access). The old shell discarded the response body and reported a bare
 * `Bootstrap failed. HTTP: 403`, which is indistinguishable from a token
 * problem.
 *
 * This script:
 *   - does not call the endpoint at all when the database already exists
 *     (the schema was verified in place, so bootstrap is neither needed nor
 *     safe to require);
 *   - captures status, content-type, edge markers and a bounded, sanitized
 *     body, and says plainly whether Nova Mail or the Cloudflare edge answered;
 *   - retries once over the workers.dev URL when the custom domain is
 *     edge-blocked;
 *   - never reads, prints or logs BOOTSTRAP_TOKEN (it is passed by environment
 *     and redacted from every diagnostic).
 *
 * Authentication itself is unchanged: it lives in src/init/bootstrap.js.
 */

export const BOOTSTRAP_HEADER = 'X-Bootstrap-Token';
export const BOOTSTRAP_PATH = '/api/bootstrap';
export const MIN_BOOTSTRAP_TOKEN_LENGTH = 32;
export const MAX_DIAGNOSTIC_BODY = 400;
export const MAX_BODY_BYTES = 2048;

/** Remove terminal escape sequences so a diagnostic is readable in a log. */
export function stripAnsi(value) {
	return String(value ?? '').replace(/\u001B\[[0-9;]*[A-Za-z]/g, '');
}

/** Replace the bootstrap token with a placeholder, defensively. */
export function redact(value, secret) {
	let text = String(value ?? '');
	if (secret && secret.length > 0) text = text.split(secret).join('[redacted]');
	return text;
}

/** Collapse a response body into one short, credential-free line. */
export function sanitizeBody(value, max = MAX_DIAGNOSTIC_BODY) {
	const text = stripAnsi(value).replace(/\s+/g, ' ').trim();
	if (!text) return '';
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Read at most `maxBytes` of a fetch Response body. */
export async function readBoundedText(response, maxBytes = MAX_BODY_BYTES) {
	const body = response?.body;
	if (!body || typeof body.getReader !== 'function') {
		const text = typeof response?.text === 'function' ? await response.text() : '';
		return String(text).slice(0, maxBytes);
	}

	const reader = body.getReader();
	const decoder = new TextDecoder();
	let out = '';
	let size = 0;
	try {
		while (size < maxBytes) {
			const { value, done } = await reader.read();
			if (done) break;
			const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
			const remaining = maxBytes - size;
			out += decoder.decode(chunk.subarray(0, remaining), { stream: true });
			size += Math.min(chunk.length, remaining);
		}
	} finally {
		try { await reader.cancel(); } catch { /* already closed */ }
	}
	return out;
}

/**
 * Classify one response:
 *   ok                 — the Worker initialized the database
 *   already-initialized — the Worker refused to repeat a completed bootstrap
 *   edge               — a Cloudflare/WAF/intermediary page, not the Worker
 *   worker-error        — the Worker (or its JSON API) rejected the request
 */
export function classifyBootstrapResponse({ status, contentType = '', server = '', cfMitigated = '', body = '' } = {}) {
	const type = String(contentType).toLowerCase();
	const text = String(body).trim();
	if (status === 200 && text === 'success') return 'ok';
	if (status === 409) return 'already-initialized';
	const edge = Boolean(cfMitigated) || (type.includes('text/html') && String(server).toLowerCase().includes('cloudflare'));
	return edge ? 'edge' : 'worker-error';
}

function failureReport(result, errorLog, token) {
	if (result.kind === 'network') {
		errorLog(`❌ Bootstrap request failed before a response: ${sanitizeBody(redact(result.message, token))}`);
		return;
	}
	const detail = [
		`HTTP ${result.status}`,
		result.contentType || 'unknown content-type',
		result.cfMitigated ? `cf-mitigated=${result.cfMitigated}` : '',
		result.cfRay ? `cf-ray=${result.cfRay}` : '',
	].filter(Boolean).join(', ');

	if (result.kind === 'edge') {
		errorLog(`❌ Cloudflare edge answered the bootstrap request (${detail}).`);
		errorLog('   The request never reached the Nova Mail Worker: this is a WAF / bot-protection / Access response for the custom domain, not a BOOTSTRAP_TOKEN problem.');
		const body = sanitizeBody(redact(result.body, token));
		if (body) errorLog(`   edge body: ${body}`);
		return;
	}

	errorLog(`❌ Nova Mail rejected the bootstrap request (${detail}).`);
	if (result.status === 404) {
		errorLog('   The Worker answers 404 when X-Bootstrap-Token is missing, wrong, or shorter than 32 characters.');
	}
	const body = sanitizeBody(redact(result.body, token));
	if (body) errorLog(`   response: ${body}`);
}

/**
 * @param {{
 *   newDatabase: boolean,
 *   baseUrl: string,
 *   fallbackUrl?: string,
 *   token?: string,
 *   fetchImpl?: typeof fetch,
 *   log?: (...args: any[]) => void,
 *   errorLog?: (...args: any[]) => void,
 * }} options
 */
export async function runBootstrap({
	newDatabase,
	baseUrl,
	fallbackUrl = '',
	token = '',
	fetchImpl = globalThis.fetch,
	log = console.log,
	errorLog = console.error,
}) {
	if (!newDatabase) {
		log('ℹ️ Existing database: the schema was verified in place, so the one-time /api/bootstrap endpoint is not called.');
		return { ok: true, skipped: true };
	}

	if (typeof token !== 'string' || token.length < MIN_BOOTSTRAP_TOKEN_LENGTH) {
		errorLog('❌ The database is uninitialized but BOOTSTRAP_TOKEN is missing or shorter than 32 characters.');
		errorLog('   Set the BOOTSTRAP_TOKEN repository secret, or complete the one-time bootstrap manually, before deploying.');
		return { ok: false, reason: 'missing-token' };
	}

	if (!baseUrl) {
		errorLog('❌ No Worker URL is available to reach /api/bootstrap (set CUSTOM_DOMAIN or expose workers.dev).');
		return { ok: false, reason: 'missing-url' };
	}

	const attempt = async (label, origin) => {
		log(`🔁 POST ${BOOTSTRAP_PATH} via ${label}`);
		let response;
		try {
			response = await fetchImpl(new URL(BOOTSTRAP_PATH, origin).toString(), {
				method: 'POST',
				headers: { [BOOTSTRAP_HEADER]: token },
				redirect: 'manual',
			});
		} catch (error) {
			return { kind: 'network', label, message: error?.message || String(error) };
		}

		const contentType = response.headers?.get?.('content-type') || '';
		const server = response.headers?.get?.('server') || '';
		const cfMitigated = response.headers?.get?.('cf-mitigated') || '';
		const cfRay = response.headers?.get?.('cf-ray') || '';
		const body = await readBoundedText(response);
		return { kind: classifyBootstrapResponse({ status: response.status, contentType, server, cfMitigated, body }), label, status: response.status, contentType, server, cfMitigated, cfRay, body };
	};

	const finish = (result) => {
		if (result.kind === 'ok') {
			log('✅ New database initialized through /api/bootstrap.');
			return { ok: true, result };
		}
		log('✅ Database was already initialized; bootstrap was not repeated.');
		return { ok: true, result };
	};

	const first = await attempt('custom domain', baseUrl);
	if (first.kind === 'ok' || first.kind === 'already-initialized') return finish(first);

	if (first.kind === 'edge' && fallbackUrl && fallbackUrl !== baseUrl) {
		errorLog(`⚠️ The custom domain answered with a Cloudflare edge response (HTTP ${first.status}); retrying over the workers.dev URL.`);
		const second = await attempt('workers.dev', fallbackUrl);
		if (second.kind === 'ok' || second.kind === 'already-initialized') return finish(second);
		failureReport(second, errorLog, token);
		return { ok: false, reason: second.kind, result: second, first };
	}

	failureReport(first, errorLog, token);
	return { ok: false, reason: first.kind, result: first };
}

function parseArgs(argv) {
	const args = { newDatabase: false, url: '', fallbackUrl: '' };
	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index];
		if (flag === '--new-database') args.newDatabase = String(argv[index + 1]).toLowerCase() === 'true';
		else if (flag === '--url') args.url = argv[index + 1] || '';
		else if (flag === '--fallback-url') args.fallbackUrl = argv[index + 1] || '';
	}
	return args;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const result = await runBootstrap({
		newDatabase: args.newDatabase,
		baseUrl: args.url || process.env.BOOTSTRAP_URL || '',
		fallbackUrl: args.fallbackUrl || process.env.BOOTSTRAP_FALLBACK_URL || '',
		token: process.env.BOOTSTRAP_TOKEN || '',
	});
	process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
