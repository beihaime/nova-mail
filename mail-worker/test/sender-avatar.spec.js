import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import senderAvatarService, {
	AVATAR_SOURCE,
	classifyImage,
	initialsFrom,
	normalizeEmail,
	parseExclude,
	resultCacheKey,
	safeRemoteUrl,
	sanitizeSvg,
	sniffImageType,
	validDescriptor,
	validDomain
} from '../src/service/sender-avatar-service';
import {
	DEFAULT_BIMI_SELECTOR,
	bimiRecordName,
	normalizeTxtValue,
	parseBimiRecord,
	parseBimiSelectorHeader,
	validBimiSelector
} from '../src/lib/bimi';
import {
	alignedDomains,
	parseProvenanceRecord,
	registerAuthenticationVerifier,
	verifyBrandAuthentication
} from '../src/service/mail-authentication';

const SECRET = 'test-secret-value-0123456789abcdef';
const PUBLIC_IP = '93.184.216.34';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const SVG_WITH_SCRIPT = new TextEncoder().encode(
	'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><rect width="1" height="1"/></svg>'
);

function fakeKv() {
	const store = new Map();
	return {
		store,
		async get(key, options) {
			if (!store.has(key)) return null;
			const value = store.get(key);
			return options?.type === 'json' ? JSON.parse(value) : value;
		},
		async put(key, value) {
			store.set(key, value);
		},
		async delete(key) {
			store.delete(key);
		}
	};
}

function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function imageResponse(bytes = PNG, contentType = 'image/png') {
	return new Response(bytes, { status: 200, headers: { 'Content-Type': contentType } });
}

/** A DNS/fetch stub that answers only the hosts a test expects. */
function stubNetwork({ bimiRecord = null, logo = null, logoType = 'image/svg+xml', gravatar = PNG, favicon = PNG } = {}) {
	const calls = [];
	vi.stubGlobal('fetch', vi.fn(async (input) => {
		const url = String(input instanceof Request ? input.url : input);
		calls.push(url);

		if (url.startsWith('https://cloudflare-dns.com/dns-query')) {
			if (url.includes('_bimi.') && url.includes('type=TXT')) {
				return jsonResponse({ Answer: bimiRecord ? [{ data: bimiRecord, TTL: 600 }] : [] });
			}
			return jsonResponse({ Answer: [{ data: PUBLIC_IP, TTL: 600 }] });
		}
		if (url.includes('/logo.')) {
			if (!logo) return new Response(null, { status: 404 });
			return imageResponse(logo, logoType);
		}
		if (url.startsWith('https://gravatar.com/avatar/')) {
			return gravatar ? imageResponse(gravatar) : new Response(null, { status: 404 });
		}
		if (url.endsWith('/favicon.ico')) {
			return favicon ? imageResponse(favicon, 'application/octet-stream') : new Response(null, { status: 404 });
		}
		return new Response(null, { status: 404 });
	}));
	return calls;
}

function context() {
	return { env: { kv: fakeKv(), jwt_secret: SECRET } };
}

function decodeId(url) {
	return decodeURIComponent(new URL(url, 'https://mail.example').searchParams.get('id'));
}

beforeEach(() => {
	registerAuthenticationVerifier(null);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('BIMI parsing', () => {
	it('accepts only a v=BIMI1 selector that is a legal DNS label', () => {
		expect(parseBimiSelectorHeader('v=BIMI1; s=selector1')).toBe('selector1');
		expect(parseBimiSelectorHeader('V=bimi1; S=Brand')).toBe('brand');
		expect(parseBimiSelectorHeader('v=BIMI1; s=not a label')).toBe('');
		expect(parseBimiSelectorHeader('v=BIMI2; s=selector1')).toBe('');
		expect(parseBimiSelectorHeader('s=selector1')).toBe('');
		expect(parseBimiSelectorHeader(undefined)).toBe('');
		expect(validBimiSelector('-bad')).toBe('');
		expect(validBimiSelector('a'.repeat(64))).toBe('');
	});

	it('parses l=, a= and avp= and ignores non-BIMI records', () => {
		const record = parseBimiRecord('"v=BIMI1; l=https://cdn.example.com/logo.svg; a=https://ca.example.com/vmc.pem; avp=https://ca.example.com/avp"');
		expect(record).toEqual({
			v: 'BIMI1',
			l: 'https://cdn.example.com/logo.svg',
			a: 'https://ca.example.com/vmc.pem',
			avp: 'https://ca.example.com/avp'
		});

		expect(parseBimiRecord('v=spf1 include:_spf.example.com ~all')).toBeNull();
		expect(parseBimiRecord('v=DKIM1; k=rsa; p=abc')).toBeNull();
		expect(parseBimiRecord('')).toBeNull();
	});

	it('joins a TXT value split into multiple character-strings', () => {
		expect(normalizeTxtValue('"v=BIMI1; l=https://x/logo.svg" ";"')).toBe('v=BIMI1; l=https://x/logo.svg;');
		expect(normalizeTxtValue('"v=BIMI1"')).toBe('v=BIMI1');
	});

	it('builds the default and explicit record names', () => {
		expect(bimiRecordName('Example.com', '')).toBe('default._bimi.example.com');
		expect(bimiRecordName('example.com', 'brand')).toBe('brand._bimi.example.com');
		expect(DEFAULT_BIMI_SELECTOR).toBe('default');
	});
});

describe('domain and address validation', () => {
	it('rejects IP literals, private hosts, ports and single labels', () => {
		expect(validDomain('example.com')).toBe('example.com');
		expect(validDomain('Example.COM.')).toBe('example.com');
		expect(validDomain('169.254.169.254')).toBe('');
		expect(validDomain('127.0.0.1')).toBe('');
		expect(validDomain('10.0.0.1')).toBe('');
		expect(validDomain('localhost')).toBe('');
		expect(validDomain('example.com:8080')).toBe('');
		expect(validDomain('user@example.com')).toBe('');
		expect(validDomain('example.com/path')).toBe('');
	});

	it('normalises an address and refuses malformed ones', () => {
		expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
		expect(normalizeEmail('not-an-email')).toBe('');
		expect(normalizeEmail('a@@example.com')).toBe('');
		expect(normalizeEmail('a@localhost')).toBe('');
	});

	it('allows only public http(s) URLs without credentials or odd ports', () => {
		expect(safeRemoteUrl('https://example.com/logo.svg', true)?.toString()).toBe('https://example.com/logo.svg');
		expect(safeRemoteUrl('http://example.com/logo.svg', true)).toBeNull();
		expect(safeRemoteUrl('https://169.254.169.254/latest/meta-data', true)).toBeNull();
		expect(safeRemoteUrl('https://127.0.0.1/logo.svg', true)).toBeNull();
		expect(safeRemoteUrl('https://localhost/logo.svg', true)).toBeNull();
		expect(safeRemoteUrl('https://user:pass@example.com/logo.svg', true)).toBeNull();
		expect(safeRemoteUrl('https://example.com:8080/logo.svg', true)).toBeNull();
		expect(safeRemoteUrl('file:///etc/passwd')).toBeNull();
	});
});

describe('image classification', () => {
	it('sniffs raster magic numbers', () => {
		expect(sniffImageType(PNG)).toBe('image/png');
		expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
		expect(sniffImageType(new Uint8Array([0x00, 0x00, 0x01, 0x00, 1, 2]))).toBe('image/x-icon');
		expect(sniffImageType(new TextEncoder().encode('<html>'))).toBe('');
	});

	it('accepts a favicon served as application/octet-stream', () => {
		const classified = classifyImage(PNG, 'application/octet-stream');
		expect(classified.contentType).toBe('image/png');
	});

	it('rejects HTML masquerading as an image', () => {
		expect(classifyImage(new TextEncoder().encode('<html><body>hi</body></html>'), 'text/html')).toBeNull();
		expect(classifyImage(new TextEncoder().encode('<html></html>'), 'application/octet-stream')).toBeNull();
	});

	it('sanitises a remote SVG before it can be served', () => {
		const cleaned = sanitizeSvg(SVG_WITH_SCRIPT);
		expect(cleaned).not.toBeNull();
		const text = new TextDecoder().decode(cleaned);
		expect(text).not.toMatch(/<script/i);
		expect(text).not.toMatch(/onload/i);
		expect(text).not.toMatch(/javascript:/i);
		expect(text).toMatch(/<svg/);

		const classified = classifyImage(SVG_WITH_SCRIPT, 'image/svg+xml');
		expect(classified.contentType).toBe('image/svg+xml');
	});

	it('never classifies a non-SVG payload as SVG', () => {
		expect(classifyImage(PNG, 'image/svg+xml')).toBeNull();
	});
});

describe('brand authentication gate', () => {
	it('never trusts an empty or sender-supplied Authentication-Results header', () => {
		expect(verifyBrandAuthentication({ authResults: '', domain: 'example.com' })).toBe(false);
		expect(verifyBrandAuthentication({ domain: 'example.com' })).toBe(false);
		expect(
			verifyBrandAuthentication({
				authResults: 'Authentication-Results: mx.example; dmarc=pass header.from=example.com; dkim=pass',
				domain: 'example.com'
			})
		).toBe(false);
	});

	it('trusts only a provenance record with aligned DMARC + SPF/DKIM pass', () => {
		const record = JSON.stringify({
			source: 'trusted-ingress',
			spf: 'pass',
			dkim: 'pass',
			dmarc: 'pass',
			headerFrom: 'example.com'
		});
		expect(verifyBrandAuthentication({ authResults: record, domain: 'example.com' })).toBe(true);
		expect(verifyBrandAuthentication({ authResults: record, domain: 'evil.example' })).toBe(false);

		const misaligned = JSON.stringify({
			source: 'trusted-ingress',
			spf: 'pass',
			dkim: 'pass',
			dmarc: 'pass',
			headerFrom: 'attacker.test'
		});
		expect(verifyBrandAuthentication({ authResults: misaligned, domain: 'example.com' })).toBe(false);

		const noDmarc = JSON.stringify({ source: 'trusted-ingress', spf: 'pass', dkim: 'pass', headerFrom: 'example.com' });
		expect(verifyBrandAuthentication({ authResults: noDmarc, domain: 'example.com' })).toBe(false);

		const unknownSource = JSON.stringify({
			source: 'random-header',
			spf: 'pass',
			dkim: 'pass',
			dmarc: 'pass',
			headerFrom: 'example.com'
		});
		expect(parseProvenanceRecord(unknownSource)).toBeNull();
		expect(verifyBrandAuthentication({ authResults: unknownSource, domain: 'example.com' })).toBe(false);
	});

	it('exposes the reserved verifier hook', () => {
		registerAuthenticationVerifier(({ domain }) => domain === 'example.com');
		expect(verifyBrandAuthentication({ authResults: '', domain: 'example.com' })).toBe(true);
		expect(verifyBrandAuthentication({ authResults: '', domain: 'other.com' })).toBe(false);

		registerAuthenticationVerifier(() => {
			throw new Error('broken verifier');
		});
		expect(verifyBrandAuthentication({ authResults: '', domain: 'example.com' })).toBe(false);
	});

	it('aligns a parent/child domain', () => {
		expect(alignedDomains('mail.example.com', 'example.com')).toBe(true);
		expect(alignedDomains('example.com', 'mail.example.com')).toBe(true);
		expect(alignedDomains('example.com.evil.test', 'example.com')).toBe(false);
	});
});

describe('avatar shape helpers', () => {
	it('derives an initial from the name and then the mailbox', () => {
		expect(initialsFrom('GitHub', 'x@example.com')).toBe('G');
		expect(initialsFrom('', 'chatgpt@example.com')).toBe('C');
		expect(initialsFrom('', '')).toBe('?');
	});

	it('parses the exclude list and validates signed descriptors', () => {
		expect([...parseExclude('bimi,gravatar,nonsense')]).toEqual(['bimi', 'gravatar']);
		expect([...parseExclude('')]).toEqual([]);

		expect(validDescriptor({ s: 'gravatar', e: 'user@example.com' })).toBe(true);
		expect(validDescriptor({ s: 'bimi', d: 'example.com', sel: 'brand', u: 'https://cdn.example.com/logo.svg' })).toBe(true);
		expect(validDescriptor({ s: 'bimi', d: 'example.com', u: 'http://cdn.example.com/logo.svg' })).toBe(false);
		expect(validDescriptor({ s: 'domain', d: '169.254.169.254' })).toBe(false);
		expect(validDescriptor({ s: 'nope' })).toBe(false);
		expect(validDescriptor({ s: 'local', e: 'user@example.com', h: 'short' })).toBe(false);
	});
});

describe('resolution chain', () => {
	it('falls back to Gravatar with SHA-256 and serves it through the signed proxy', async () => {
		stubNetwork();
		const c = context();

		const avatar = await senderAvatarService.resolve(c, { email: ' User@Example.com ', userId: 1, name: 'User' });
		expect(avatar.source).toBe(AVATAR_SOURCE.GRAVATAR);
		expect(avatar.verified).toBe(false);
		expect(avatar.initials).toBe('U');
		expect(avatar.url).toMatch(/^\/api\/avatar\/image\?id=/);

		const gravatarCall = globalThis.fetch.mock.calls
			.map(call => String(call[0]))
			.find(url => url.startsWith('https://gravatar.com/avatar/'));
		// SHA-256 of the trimmed, lower-cased address.
		expect(gravatarCall).toContain('b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514');
		expect(gravatarCall).toContain('d=404');

		const response = await senderAvatarService.image(c, decodeId(avatar.url));
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
	});

	it('uses a valid BIMI logo but keeps it unverified without a trusted verifier', async () => {
		stubNetwork({
			bimiRecord: '"v=BIMI1; l=https://cdn.example.com/logo.svg;"',
			logo: SVG_WITH_SCRIPT
		});
		const c = context();

		const avatar = await senderAvatarService.resolve(c, { email: 'brand@example.com' });
		expect(avatar.source).toBe(AVATAR_SOURCE.BIMI);
		expect(avatar.verified).toBe(false);

		const response = await senderAvatarService.image(c, decodeId(avatar.url));
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/svg+xml');
		const text = await response.text();
		expect(text).not.toMatch(/<script/i);
		expect(text).not.toMatch(/onload/i);
	});

	it('marks a BIMI avatar verified once a trusted verifier approves the domain', async () => {
		stubNetwork({ bimiRecord: '"v=BIMI1; l=https://cdn.example.com/logo.svg;"', logo: PNG, logoType: 'image/png' });
		registerAuthenticationVerifier(({ domain }) => domain === 'example.com');

		const avatar = await senderAvatarService.resolve(context(), { email: 'brand@example.com' });
		expect(avatar.source).toBe(AVATAR_SOURCE.BIMI);
		expect(avatar.verified).toBe(true);
	});

	it('degrades to the default BIMI selector when message metadata is unavailable', async () => {
		stubNetwork({ bimiRecord: '"v=BIMI1; l=https://cdn.example.com/logo.svg;"', logo: PNG, logoType: 'image/png' });
		// No D1 binding on the context: the per-message selector/auth lookup must
		// fail open (default selector, unverified brand) instead of throwing.
		const avatar = await senderAvatarService.resolve(context(), { email: 'brand@example.com', emailId: 7, userId: 1 });

		expect(avatar.source).toBe(AVATAR_SOURCE.BIMI);
		expect(avatar.verified).toBe(false);
		const names = globalThis.fetch.mock.calls.map(call => decodeURIComponent(String(call[0])));
		expect(names.some(url => url.includes('default._bimi.example.com'))).toBe(true);
	});

	it('rejects a BIMI logo on a private host and falls through to Gravatar', async () => {
		stubNetwork({ bimiRecord: '"v=BIMI1; l=https://127.0.0.1/logo.svg;"' });
		const c = context();

		const avatar = await senderAvatarService.resolve(c, { email: 'brand@example.com' });
		expect(avatar.source).toBe(AVATAR_SOURCE.GRAVATAR);
	});

	it('falls back to the domain favicon and finally to the initial', async () => {
		const faviconNetwork = stubNetwork({ favicon: PNG, gravatar: null });
		const domainAvatar = await senderAvatarService.resolve(context(), { email: 'user@example.com' });
		expect(domainAvatar.source).toBe(AVATAR_SOURCE.DOMAIN);
		expect(domainAvatar.verified).toBe(false);
		expect(faviconNetwork.some(url => url.includes('/favicon.ico'))).toBe(true);

		vi.unstubAllGlobals();
		stubNetwork({ favicon: null, gravatar: null });
		const initialAvatar = await senderAvatarService.resolve(context(), { email: 'user@example.com' });
		expect(initialAvatar.source).toBe(AVATAR_SOURCE.INITIAL);
		expect(initialAvatar.url).toBeNull();
	});

	it('rejects a forged or tampered signed id', async () => {
		stubNetwork();
		const c = context();
		const avatar = await senderAvatarService.resolve(c, { email: 'user@example.com' });

		const id = decodeId(avatar.url);
		const tampered = `${id.slice(0, -1)}${id.endsWith('A') ? 'B' : 'A'}`;
		const response = await senderAvatarService.image(c, tampered);
		expect(response.status).toBe(404);

		const forged = await senderAvatarService.image(
			c,
			`${btoa(JSON.stringify({ s: 'domain', d: '169.254.169.254' })).replace(/\+/g, '-').replace(/\//g, '_')}.nope`
		);
		expect(forged.status).toBe(404);
	});

	it('serves cached metadata on the second list pass without re-fetching', async () => {
		const calls = stubNetwork();
		const c = context();

		await senderAvatarService.resolve(c, { email: 'user@example.com' });
		const afterFirst = calls.length;
		const second = await senderAvatarService.resolve(c, { email: 'user@example.com' });

		expect(second.source).toBe(AVATAR_SOURCE.GRAVATAR);
		expect(calls.length).toBe(afterFirst);
	});

	it('keys the result cache by authentication state so a verified brand cannot leak', async () => {
		const c = context();
		const verified = await resultCacheKey('user@example.com', 'default', '{"dmarc":"pass"}');
		const unverified = await resultCacheKey('user@example.com', 'default', '');
		const otherSelector = await resultCacheKey('user@example.com', 'brand', '{"dmarc":"pass"}');

		expect(verified).not.toBe(unverified);
		expect(verified).not.toBe(otherSelector);
		expect(await resultCacheKey('user@example.com', 'default', '')).toBe(unverified);
	});

	it('attaches cheap avatars to list rows and marks the rest pending', async () => {
		stubNetwork();
		const c = context();
		const rows = [{ emailId: 1, sendEmail: 'User@Example.com', name: 'User' }];

		await senderAvatarService.attach(c, rows);
		expect(rows[0].avatar.source).toBe(AVATAR_SOURCE.INITIAL);
		expect(rows[0].avatar.pending).toBe(true);
		expect(rows[0].avatar.initials).toBe('U');
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});
});
