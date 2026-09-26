import { and, eq, inArray } from 'drizzle-orm';
import orm from '../entity/orm';
import email from '../entity/email';
import account from '../entity/account';
import { oauth } from '../entity/oauth';
import oauthAccount from '../entity/oauth-account';
import emailUtils from '../utils/email-utils';
import urlSafety from '../utils/url-safety';
import kvConst from '../const/kv-const';
import {
	DEFAULT_BIMI_SELECTOR,
	bimiRecordName,
	parseBimiRecord,
	validBimiSelector
} from '../lib/bimi';
import { verifyBrandAuthentication } from './mail-authentication';

/**
 * Unified sender-avatar resolver.
 *
 * One resolver, one result shape, one place that knows about providers:
 *
 *   1. local   — the sender is one of this Nova Mail's addresses; use the
 *                avatar its owner already saved. No external lookup.
 *   2. bimi    — `selector._bimi.<domain>` TXT → `l=` logo. Parsed, cached by
 *                DNS TTL, and only *marked* verified when a trusted SPF/DKIM/
 *                DMARC verifier says so (see service/mail-authentication.js).
 *   3. gravatar— SHA-256 of the trimmed, lower-cased address, `d=404` so a
 *                missing avatar is a clean miss instead of Gravatar's default.
 *   4. domain  — the domain's favicon / `<link rel=icon>`, always unverified.
 *   5. initial — no image; the caller renders the existing initial avatar.
 *
 * Everything a browser is allowed to load is re-served by this Worker through
 * a capability-signed id (`/api/avatar/image?id=…`): the raw BIMI/Gravatar/
 * favicon URL never reaches the DOM, SVG is sanitised, private hosts are
 * refused, downloads are bounded and MIME-checked. Image failures fall back to
 * the next level because the metadata endpoint accepts `exclude=<source>`.
 *
 * @typedef {Object} SenderAvatar
 * @property {string|null} url
 * @property {'local'|'bimi'|'gravatar'|'domain'|'initial'} source
 * @property {boolean} verified
 * @property {string} [initials]
 * @property {boolean} [pending] metadata only ran its cheap (local/cache) path
 */

export const AVATAR_SOURCE = Object.freeze({
	LOCAL: 'local',
	BIMI: 'bimi',
	GRAVATAR: 'gravatar',
	DOMAIN: 'domain',
	INITIAL: 'initial'
});

const EXCLUDABLE = new Set([AVATAR_SOURCE.LOCAL, AVATAR_SOURCE.BIMI, AVATAR_SOURCE.GRAVATAR, AVATAR_SOURCE.DOMAIN]);

const MAX_IMAGE_BYTES = 256 * 1024;
const MAX_HTML_BYTES = 192 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const DNS_TIMEOUT_MS = 3000;
const MAX_REDIRECTS = 3;
const DNS_TTL_MIN = 300;
const DNS_TTL_MAX = 86400;
const DNS_TTL_DEFAULT = 3600;

const TTL = Object.freeze({
	local: { negative: 60 * 60 * 6 },
	// BIMI uses the record's own DNS TTL for positive lookups; this is only the
	// negative ("no record") window.
	bimi: { negative: 60 * 60 },
	gravatar: { positive: 60 * 60 * 24, negative: 60 * 60 * 6 },
	domain: { positive: 60 * 60 * 24 * 7, negative: 60 * 60 * 24 },
	// Nothing resolved: cache briefly so a list reload does not re-run the whole
	// DNS/Gravatar/favicon chain for every row.
	initial: 60 * 60 * 6,
	asset: 60 * 60 * 24 * 7
});

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

const RASTER_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/pjpeg',
	'image/gif',
	'image/webp',
	'image/avif',
	'image/heif',
	'image/heic',
	'image/bmp',
	'image/x-icon',
	'image/vnd.microsoft.icon',
	'image/ico',
	'image/tiff'
]);

const SAFE_SAME_ORIGIN_PATH = /^\/(?!\/)[\w\-.~%/?=&+,;:@!$'()*[\]]*$/;

// ---------------------------------------------------------------- primitives

function timeoutSignal(ms) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function bytesToBase64(bytes) {
	let value = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		value += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(value);
}

function base64ToBytes(value) {
	const binary = atob(value);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
	return out;
}

function base64UrlEncode(bytes) {
	let value = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		value += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(value).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlToBytes(value) {
	let padded = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
	while (padded.length % 4) padded += '=';
	const binary = atob(padded);
	return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function sha256Hex(value) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

const HMAC_KEY = Symbol('senderAvatarHmacKey');

async function hmacKey(c) {
	if (c[HMAC_KEY]) return c[HMAC_KEY];
	const key = crypto.subtle
		.importKey('raw', new TextEncoder().encode(String(c.env?.jwt_secret || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
		.catch(() => null);
	try {
		c[HMAC_KEY] = key;
	} catch {
		// A non-extensible context just re-imports the key per signature.
	}
	return key;
}

async function hmacSign(c, value) {
	const key = await hmacKey(c);
	if (!key) return '';
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
	return base64UrlEncode(new Uint8Array(signature));
}

/** Constant-time-ish comparison; avoids leaking the expected signature. */
function safeEqual(a, b) {
	const left = String(a || '');
	const right = String(b || '');
	if (left.length !== right.length) return false;
	let diff = 0;
	for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
	return diff === 0;
}

// ---------------------------------------------------------------- validation

/**
 * A syntactically valid, non-local public domain.
 *
 * Rejects anything with a path/userinfo/port, single labels, all-numeric TLDs
 * (so `169.254.169.254` can never pass as a domain) and private/link-local/
 * metadata hosts. Returns '' when unusable.
 */
export function validDomain(value) {
	const raw = String(value || '').trim().toLowerCase().replace(/\.$/, '');
	if (!raw || raw.length > 253 || /[/?#%\\\s@:]/.test(raw)) return '';
	const labels = raw.split('.');
	if (labels.length < 2) return '';
	if (!labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return '';
	if (!/[a-z]/.test(labels[labels.length - 1])) return '';
	if (urlSafety.isPrivateOrLocalHost(raw)) return '';
	return raw;
}

/** Trimmed + lower-cased address, or '' when it is not a usable mailbox. */
export function normalizeEmail(value) {
	const raw = String(value || '').trim().toLowerCase();
	const at = raw.indexOf('@');
	if (at <= 0 || at !== raw.lastIndexOf('@') || at === raw.length - 1) return '';
	const local = raw.slice(0, at);
	if (local.length > 64 || /[\s<>",;\\]/.test(local)) return '';
	if (!validDomain(raw.slice(at + 1))) return '';
	return raw;
}

/** First character of the display name, then the mailbox; `?` as last resort. */
export function initialsFrom(name, email) {
	const source = String(name || '').trim() || String(email || '').trim();
	const letter = source.charAt(0).toUpperCase();
	return letter || '?';
}

/** Parse `exclude=local,bimi` (used when a loaded image fails). */
export function parseExclude(value) {
	const list = Array.isArray(value) ? value : String(value || '').split(',');
	return new Set(
		list
			.map(item => String(item || '').trim().toLowerCase())
			.filter(item => EXCLUDABLE.has(item))
	);
}

/** https-only (or http too) URL with no credentials, odd port or private host. */
export function safeRemoteUrl(value, httpsOnly = false) {
	let url;
	try {
		url = new URL(String(value || ''));
	} catch {
		return null;
	}
	if (httpsOnly ? url.protocol !== 'https:' : !['https:', 'http:'].includes(url.protocol)) return null;
	if (url.username || url.password) return null;
	if (url.port && url.port !== '443' && url.port !== '80') return null;
	if (urlSafety.isPrivateOrLocalHost(url.hostname)) return null;
	return url;
}

// ---------------------------------------------------------------- image bytes

/** Magic-number sniff; returns a MIME type or ''. */
export function sniffImageType(bytes) {
	if (!bytes || bytes.length < 4) return '';
	const b = bytes;
	if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
	if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
	if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
	if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
	if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
		const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
		if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/avif';
		if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('mif1')) return 'image/heif';
	}
	if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return 'image/x-icon';
	return '';
}

function looksLikeSvg(bytes) {
	if (!bytes || bytes.length < 5) return false;
	const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 1024));
	return /<svg[\s>]/i.test(head);
}

/**
 * Strip everything executable from a remote SVG.
 *
 * The browser renders this through `<img>`, where scripts never run anyway, but
 * the bytes are still external input served from our own origin — so scripts,
 * event handlers, external references, `foreignObject`, embedded documents and
 * CSS urls are removed before the document is stored.
 */
export function sanitizeSvg(bytes) {
	if (!looksLikeSvg(bytes)) return null;
	const text = new TextDecoder('utf-8').decode(bytes);
	const clean = text
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<!DOCTYPE[\s\S]*?>/gi, '')
		.replace(/<\?xml[\s\S]*?\?>/gi, '')
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<(iframe|embed|object|use|image|a|animate|set|handler|audio|video|canvas|meta|link)\b[^>]*>/gi, '')
		.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
		.replace(/\s(?:xlink:href|href|src)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
		.replace(/url\(\s*['"]?[^)#]+\)?/gi, 'none');
	if (/<script|javascript:|<!ENTITY|data:text\/html/i.test(clean)) return null;
	return new TextEncoder().encode(clean);
}

/**
 * Decide what an image response really is, from its declared type and its
 * bytes. SVG is sanitised; unknown/`octet-stream` types are accepted only when
 * the bytes are a recognisable raster image.
 */
export function classifyImage(bytes, contentTypeHeader) {
	if (!bytes || !bytes.length) return null;
	const declared = String(contentTypeHeader || '').split(';')[0].trim().toLowerCase();
	const declaredRaster = RASTER_TYPES.has(declared);
	const declaredSvg = declared === 'image/svg+xml';

	if (declaredSvg || (!declaredRaster && looksLikeSvg(bytes))) {
		const sanitized = sanitizeSvg(bytes);
		return sanitized ? { bytes: sanitized, contentType: 'image/svg+xml' } : null;
	}
	if (declaredRaster) {
		const normalized = declared === 'image/jpg' || declared === 'image/pjpeg'
			? 'image/jpeg'
			: declared === 'image/ico'
				? 'image/x-icon'
				: declared;
		return { bytes, contentType: normalized };
	}
	const sniffed = sniffImageType(bytes);
	return sniffed ? { bytes, contentType: sniffed } : null;
}

// ---------------------------------------------------------------- cache + net

async function kvGetJson(c, key) {
	try {
		return await c.env.kv.get(key, { type: 'json' });
	} catch {
		return null;
	}
}

async function kvPutJson(c, key, value, expirationTtl) {
	try {
		await c.env.kv.put(key, JSON.stringify(value), { expirationTtl });
	} catch {
		// A cache is an optimisation: a KV failure must never fail the request.
	}
}

async function digestKey(descriptor) {
	return sha256Hex(JSON.stringify(descriptor));
}

function clampTtl(ttl) {
	const value = Number(ttl) || 0;
	if (value < DNS_TTL_MIN) return DNS_TTL_DEFAULT;
	return Math.min(value, DNS_TTL_MAX);
}

/** DoH JSON lookup against a fixed resolver host (never a user-supplied one). */
async function dnsQuery(name, type) {
	const { signal, clear } = timeoutSignal(DNS_TIMEOUT_MS);
	try {
		const response = await fetch(
			`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
			{ headers: { Accept: 'application/dns-json' }, signal }
		);
		if (!response.ok) return { answers: [], ttl: 0 };
		const data = await response.json();
		const answers = Array.isArray(data?.Answer) ? data.Answer : [];
		const ttls = answers.map(answer => Number(answer?.TTL) || 0).filter(value => value > 0);
		return { answers, ttl: ttls.length ? Math.min(...ttls) : 0 };
	} catch {
		return { answers: [], ttl: 0 };
	} finally {
		clear();
	}
}

/**
 * Resolve a hostname through DoH and refuse it when any address is private.
 * A DNS failure fails closed (returns true) rather than allowing the fetch.
 */
async function resolvesToPrivateAddress(hostname) {
	if (urlSafety.isPrivateOrLocalHost(hostname)) return true;
	for (const type of ['A', 'AAAA']) {
		const { answers } = await dnsQuery(hostname, type);
		if (!answers.length) continue;
		if (answers.some(answer => urlSafety.isPrivateOrLocalHost(String(answer?.data || '')))) return true;
	}
	return false;
}

async function fetchPublicImage(rawUrl, { httpsOnly = false } = {}) {
	let current = safeRemoteUrl(rawUrl, httpsOnly);
	for (let attempt = 0; attempt <= MAX_REDIRECTS && current; attempt += 1) {
		if (await resolvesToPrivateAddress(current.hostname)) return null;
		const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
		try {
			const response = await fetch(current.toString(), {
				redirect: 'manual',
				headers: { Accept: 'image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.1' },
				signal
			});
			if (REDIRECT_STATUS.has(response.status)) {
				current = safeRemoteUrl(new URL(response.headers.get('location') || '', current).toString(), httpsOnly);
				continue;
			}
			if (!response.ok) return null;
			const declaredLength = Number(response.headers.get('content-length') || 0);
			if (declaredLength > MAX_IMAGE_BYTES) return null;
			const buffer = await response.arrayBuffer();
			if (!buffer.byteLength || buffer.byteLength > MAX_IMAGE_BYTES) return null;
			return classifyImage(new Uint8Array(buffer), response.headers.get('content-type'));
		} catch {
			return null;
		} finally {
			clear();
		}
	}
	return null;
}

async function fetchHtml(rawUrl) {
	const current = safeRemoteUrl(rawUrl, true);
	if (!current || await resolvesToPrivateAddress(current.hostname)) return '';
	const { signal, clear } = timeoutSignal(FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(current.toString(), { redirect: 'manual', headers: { Accept: 'text/html,*/*;q=0.1' }, signal });
		if (!response.ok) return '';
		if (!/html/i.test(response.headers.get('content-type') || '')) return '';
		const buffer = await response.arrayBuffer();
		if (!buffer.byteLength || buffer.byteLength > MAX_HTML_BYTES) return '';
		return new TextDecoder('utf-8').decode(buffer);
	} catch {
		return '';
	} finally {
		clear();
	}
}

// ---------------------------------------------------------------- providers

async function ensureAsset(c, descriptor, fetcher, negativeTtl) {
	const key = kvConst.AVATAR_ASSET + await digestKey(descriptor);
	const cached = await kvGetJson(c, key);
	if (cached) return cached.body ? cached : null;

	const fetched = await fetcher();
	if (!fetched) {
		await kvPutJson(c, key, { body: null }, negativeTtl);
		return null;
	}
	const stored = { contentType: fetched.contentType, body: bytesToBase64(fetched.bytes) };
	await kvPutJson(c, key, stored, TTL.asset);
	return stored;
}

async function lookupBimiRecord(c, domain, selector) {
	const name = bimiRecordName(domain, selector);
	const key = kvConst.AVATAR_BIMI + name;
	const cached = await kvGetJson(c, key);
	if (cached) return cached;

	const { answers, ttl } = await dnsQuery(name, 'TXT');
	let record = null;
	for (const answer of answers) {
		const parsed = parseBimiRecord(answer?.data);
		if (parsed) {
			record = parsed;
			break;
		}
	}

	const entry = { record, ttl: record ? clampTtl(ttl) : DNS_TTL_DEFAULT };
	await kvPutJson(c, key, entry, record ? clampTtl(ttl) : TTL.bimi.negative);
	return entry;
}

async function resolveBimi(c, { domain, selector, authResults }) {
	const { record } = await lookupBimiRecord(c, domain, selector);
	const logo = safeRemoteUrl(record?.l, true);
	if (!logo) return null;

	const descriptor = { s: AVATAR_SOURCE.BIMI, d: domain, sel: selector, u: logo.toString() };
	const asset = await ensureAsset(
		c,
		descriptor,
		() => fetchPublicImage(descriptor.u, { httpsOnly: true }),
		TTL.bimi.negative
	);
	if (!asset) return null;

	return {
		source: AVATAR_SOURCE.BIMI,
		// DNS proves a logo exists, never that this message came from the brand.
		verified: verifyBrandAuthentication({ authResults, domain }),
		descriptor
	};
}

async function resolveGravatar(c, address) {
	const hash = await sha256Hex(address);
	const descriptor = { s: AVATAR_SOURCE.GRAVATAR, e: address };
	// `d=404` makes a missing avatar a 404 instead of Gravatar's generated
	// default, which would otherwise mask every level below this one.
	const target = `https://gravatar.com/avatar/${hash}?d=404&s=256`;
	const asset = await ensureAsset(
		c,
		descriptor,
		() => fetchPublicImage(target, { httpsOnly: true }),
		TTL.gravatar.negative
	);
	return asset ? { source: AVATAR_SOURCE.GRAVATAR, verified: false, descriptor } : null;
}

async function fetchDomainLogo(domain) {
	const icon = await fetchPublicImage(`https://${domain}/favicon.ico`, { httpsOnly: true });
	if (icon) return icon;

	const html = await fetchHtml(`https://${domain}/`);
	if (!html) return null;

	for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
		if (!/\brel\s*=\s*["'][^"']*\bicon\b/i.test(tag)) continue;
		const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
		if (!href) continue;
		let iconUrl;
		try {
			iconUrl = new URL(href, `https://${domain}/`).toString();
		} catch {
			continue;
		}
		const asset = await fetchPublicImage(iconUrl, { httpsOnly: true });
		if (asset) return asset;
	}
	return null;
}

async function resolveDomain(c, domain) {
	const descriptor = { s: AVATAR_SOURCE.DOMAIN, d: domain };
	const asset = await ensureAsset(c, descriptor, () => fetchDomainLogo(domain), TTL.domain.negative);
	return asset ? { source: AVATAR_SOURCE.DOMAIN, verified: false, descriptor } : null;
}

// ---------------------------------------------------------------- local db

function acceptableLocalAvatar(value) {
	const raw = String(value || '').trim();
	if (!raw) return '';
	if (SAFE_SAME_ORIGIN_PATH.test(raw)) return raw;
	const url = safeRemoteUrl(raw, true);
	return url ? url.toString() : '';
}

function localAvatarSelect(c) {
	return orm(c)
		.select({
			email: account.email,
			oauthAvatar: oauth.avatar,
			providerAvatar: oauthAccount.providerAvatarUrl
		})
		.from(account)
		.leftJoin(oauth, eq(oauth.userId, account.userId))
		.leftJoin(oauthAccount, eq(oauthAccount.userId, account.userId));
}

/**
 * Map every requested address to the avatar its Nova Mail owner saved.
 * Unmatched addresses map to ''. The lookup is local by design: no external
 * service is consulted to answer "is this one of our addresses?".
 */
async function lookupLocalBatch(c, addresses, rawAddresses) {
	const map = new Map();
	for (const address of addresses) map.set(address, '');
	if (!addresses.length) return map;

	const candidates = [...new Set([...addresses, ...rawAddresses].map(value => String(value || '').trim()).filter(Boolean))];
	try {
		const rows = await localAvatarSelect(c)
			.where(and(inArray(account.email, candidates), eq(account.isDel, 0)))
			.all();
		for (const row of rows) {
			const key = String(row.email || '').trim().toLowerCase();
			if (!key) continue;
			const url = acceptableLocalAvatar(row.oauthAvatar) || acceptableLocalAvatar(row.providerAvatar);
			if (url && !map.get(key)) map.set(key, url);
		}
	} catch {
		// A missing `oauth_accounts` table (pre-v3.4 database) must not break the
		// list: the sender simply falls through to the external providers.
	}
	return map;
}

async function lookupLocalUrl(c, address, rawAddress) {
	const map = await lookupLocalBatch(c, [address], [rawAddress]);
	return map.get(address) || '';
}

async function lookupLocalUrlByEmail(c, address) {
	return lookupLocalUrl(c, address, address);
}

async function resolveLocal(c, address, localUrl) {
	if (localUrl.startsWith('/')) {
		return { source: AVATAR_SOURCE.LOCAL, verified: false, url: localUrl };
	}
	const descriptor = { s: AVATAR_SOURCE.LOCAL, e: address, h: await sha256Hex(localUrl) };
	const asset = await ensureAsset(
		c,
		descriptor,
		() => fetchPublicImage(localUrl, { httpsOnly: true }),
		TTL.local.negative
	);
	return asset ? { source: AVATAR_SOURCE.LOCAL, verified: false, descriptor } : null;
}

/**
 * Local avatar for the list path: signs the proxy URL without downloading the
 * image, so attaching avatars to 50 rows never makes 50 outbound requests. The
 * image endpoint still validates and bounds the download.
 */
async function localPreview(c, address, localUrl, initials) {
	if (localUrl.startsWith('/')) {
		return { url: localUrl, source: AVATAR_SOURCE.LOCAL, verified: false, initials };
	}
	const descriptor = { s: AVATAR_SOURCE.LOCAL, e: address, h: await sha256Hex(localUrl) };
	return publicResult(c, { source: AVATAR_SOURCE.LOCAL, verified: false, descriptor }, initials);
}

// ---------------------------------------------------------------- signing

async function signAssetUrl(c, descriptor) {
	const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(descriptor)));
	const signature = await hmacSign(c, body);
	if (!signature) return null;
	return `/api/avatar/image?id=${encodeURIComponent(`${body}.${signature}`)}`;
}

/** Validate a decoded asset descriptor (defence in depth behind the HMAC). */
export function validDescriptor(descriptor) {
	if (!descriptor || typeof descriptor !== 'object') return false;
	if (!EXCLUDABLE.has(String(descriptor.s || ''))) return false;
	if (descriptor.d !== undefined && !validDomain(descriptor.d)) return false;
	if (descriptor.e !== undefined && !normalizeEmail(descriptor.e)) return false;
	if (descriptor.u !== undefined && !safeRemoteUrl(descriptor.u, true)) return false;
	if (descriptor.sel !== undefined && !validBimiSelector(descriptor.sel)) return false;
	if (descriptor.h !== undefined && !/^[a-f0-9]{64}$/.test(String(descriptor.h))) return false;
	return true;
}

async function verifyAssetId(c, id) {
	const raw = String(id || '');
	const dot = raw.lastIndexOf('.');
	if (dot <= 0) return null;
	const body = raw.slice(0, dot);
	const signature = raw.slice(dot + 1);
	const expected = await hmacSign(c, body);
	if (!expected || !safeEqual(signature, expected)) return null;

	let descriptor;
	try {
		descriptor = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body)));
	} catch {
		return null;
	}
	return validDescriptor(descriptor) ? descriptor : null;
}

async function loadAsset(c, descriptor) {
	const key = kvConst.AVATAR_ASSET + await digestKey(descriptor);
	const cached = await kvGetJson(c, key);
	if (cached) return cached.body ? cached : null;

	let fetched = null;
	if (descriptor.s === AVATAR_SOURCE.BIMI) {
		fetched = await fetchPublicImage(descriptor.u, { httpsOnly: true });
	} else if (descriptor.s === AVATAR_SOURCE.GRAVATAR) {
		const hash = await sha256Hex(descriptor.e);
		fetched = await fetchPublicImage(`https://gravatar.com/avatar/${hash}?d=404&s=256`, { httpsOnly: true });
	} else if (descriptor.s === AVATAR_SOURCE.DOMAIN) {
		fetched = await fetchDomainLogo(descriptor.d);
	} else if (descriptor.s === AVATAR_SOURCE.LOCAL) {
		const localUrl = await lookupLocalUrlByEmail(c, descriptor.e);
		// Only serve the avatar we signed for: a changed URL invalidates the id.
		if (localUrl && !localUrl.startsWith('/') && await sha256Hex(localUrl) === descriptor.h) {
			fetched = await fetchPublicImage(localUrl, { httpsOnly: true });
		}
	}

	if (!fetched) return null;
	const stored = { contentType: fetched.contentType, body: bytesToBase64(fetched.bytes) };
	await kvPutJson(c, key, stored, TTL.asset);
	return stored;
}

// ---------------------------------------------------------------- resolution

function initialAvatar(initials) {
	return { url: null, source: AVATAR_SOURCE.INITIAL, verified: false, initials };
}

async function publicResult(c, resolved, initials) {
	const url = resolved.url || await signAssetUrl(c, resolved.descriptor);
	return {
		url: url || null,
		source: resolved.source,
		verified: resolved.verified === true,
		initials
	};
}

export async function resultCacheKey(address, selector, authResults) {
	// Authentication state is part of the key: a verified message must never
	// populate the entry an unverified message from the same sender reads.
	return kvConst.AVATAR_RESULT + await sha256Hex(`${address}|${selector}|${authResults || ''}`);
}

async function resolveIdentity(c, identity) {
	const { address, selector, authResults, localUrl, initials, exclude } = identity;
	const skip = exclude || new Set();
	const domain = validDomain(emailUtils.getDomain(address));

	if (localUrl && !skip.has(AVATAR_SOURCE.LOCAL)) {
		const local = await resolveLocal(c, address, localUrl);
		if (local) return publicResult(c, local, initials);
	}

	if (domain && !skip.has(AVATAR_SOURCE.BIMI)) {
		const bimi = await resolveBimi(c, { domain, selector, authResults });
		if (bimi) return publicResult(c, bimi, initials);
	}

	if (!skip.has(AVATAR_SOURCE.GRAVATAR)) {
		const gravatar = await resolveGravatar(c, address);
		if (gravatar) return publicResult(c, gravatar, initials);
	}

	if (domain && !skip.has(AVATAR_SOURCE.DOMAIN)) {
		const domainLogo = await resolveDomain(c, domain);
		if (domainLogo) return publicResult(c, domainLogo, initials);
	}

	return initialAvatar(initials);
}

function resultTtl(source) {
	if (source === AVATAR_SOURCE.BIMI) return DNS_TTL_DEFAULT;
	if (source === AVATAR_SOURCE.GRAVATAR) return TTL.gravatar.positive;
	if (source === AVATAR_SOURCE.DOMAIN) return TTL.domain.positive;
	return TTL.initial;
}

async function resolvePublic(c, identity) {
	const exclude = identity.exclude || new Set();
	const cacheable = exclude.size === 0;
	const key = cacheable ? await resultCacheKey(identity.address, identity.selector, identity.authResults) : '';

	if (cacheable) {
		const cached = await kvGetJson(c, key);
		if (cached) return cached;
	}

	const result = await resolveIdentity(c, identity);

	// `local` is a cheap indexed lookup and must reflect an avatar change, so it
	// is never result-cached (its bytes still are, keyed by the URL hash). The
	// display initials are per-row, so they are never part of a shared entry.
	if (cacheable && result.source !== AVATAR_SOURCE.LOCAL) {
		const { initials: _initials, ...cacheValue } = result;
		await kvPutJson(c, key, cacheValue, resultTtl(result.source));
	}
	return result;
}

/** Auth metadata for one message, scoped to its owner. */
async function loadMessageMeta(c, emailId, userId) {
	const id = Number(emailId);
	if (!Number.isSafeInteger(id) || id <= 0 || !userId) return null;
	try {
		return await orm(c)
			.select({ authResults: email.authResults, bimiSelector: email.bimiSelector })
			.from(email)
			.where(and(eq(email.emailId, id), eq(email.userId, userId)))
			.get();
	} catch {
		return null;
	}
}

async function loadMessageMetaBatch(c, emailIds) {
	const ids = [...new Set(emailIds.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
	const map = new Map();
	if (!ids.length) return map;
	try {
		const rows = await orm(c)
			.select({ emailId: email.emailId, authResults: email.authResults, bimiSelector: email.bimiSelector })
			.from(email)
			.where(inArray(email.emailId, ids))
			.all();
		for (const row of rows) map.set(Number(row.emailId), row);
	} catch {
		// Pre-v3.9 schema: the resolver still works, just with the default selector.
	}
	return map;
}

const senderAvatarService = {

	/** Resolve one sender address. */
	async resolve(c, { email: address, emailId, userId, name, exclude } = {}) {
		const initials = initialsFrom(name, address);
		const normalized = normalizeEmail(address);
		if (!normalized) return initialAvatar(initials);

		const meta = await loadMessageMeta(c, emailId, userId);
		const selector = meta?.bimiSelector || DEFAULT_BIMI_SELECTOR;
		const localUrl = await lookupLocalUrl(c, normalized, String(address || '').trim());

		const result = await resolvePublic(c, {
			address: normalized,
			selector,
			authResults: meta?.authResults || '',
			localUrl,
			initials,
			exclude: parseExclude(exclude)
		});

		return { ...result, initials: result.initials || initials };
	},

	/**
	 * Attach an `avatar` field to list rows.
	 *
	 * Only the cheap path runs here: the batched local lookup and whatever is
	 * already cached. A row that would need DNS/Gravatar/favicon work is marked
	 * `pending` and the client asks `/api/avatar` for it, so opening the Inbox
	 * never waits on (or exhausts the subrequest budget with) dozens of lookups.
	 */
	async attach(c, rows) {
		const list = Array.isArray(rows) ? rows.filter(row => row && typeof row.sendEmail === 'string' && row.sendEmail) : [];
		if (!list.length) return rows;

		const metaById = await loadMessageMetaBatch(c, list.map(row => row.emailId));

		const addresses = [];
		const rawAddresses = [];
		const metaFor = new Map();
		for (const row of list) {
			const address = normalizeEmail(row.sendEmail);
			if (!address) continue;
			addresses.push(address);
			rawAddresses.push(String(row.sendEmail).trim());
			if (!metaFor.has(address)) {
				const meta = metaById.get(Number(row.emailId));
				metaFor.set(address, {
					selector: meta?.bimiSelector || DEFAULT_BIMI_SELECTOR,
					authResults: meta?.authResults || ''
				});
			}
		}

		const unique = [...new Set(addresses)];
		const localMap = await lookupLocalBatch(c, unique, rawAddresses);

		const cached = new Map();
		await Promise.all(unique.map(async address => {
			if (localMap.get(address)) return;
			const meta = metaFor.get(address) || {};
			const hit = await kvGetJson(c, await resultCacheKey(address, meta.selector || DEFAULT_BIMI_SELECTOR, meta.authResults));
			if (hit) cached.set(address, hit);
		}));

		await Promise.all(list.map(async row => {
			const initials = initialsFrom(row.name, row.sendEmail);
			const address = normalizeEmail(row.sendEmail);
			if (!address) {
				row.avatar = initialAvatar(initials);
				return;
			}

			const localUrl = localMap.get(address);
			if (localUrl) {
				row.avatar = await localPreview(c, address, localUrl, initials);
				return;
			}

			const hit = cached.get(address);
			if (hit) {
				row.avatar = { ...hit, initials: hit.initials || initials };
				return;
			}

			row.avatar = { ...initialAvatar(initials), pending: true };
		}));

		return rows;
	},

	/** Authenticated metadata endpoint: `GET /avatar`. */
	async metadata(c, query) {
		return this.resolve(c, {
			email: query.email,
			emailId: query.emailId,
			userId: query.userId,
			name: query.name,
			exclude: query.exclude
		});
	},

	/** Public, capability-signed image proxy: `GET /avatar/image?id=…`. */
	async image(c, id) {
		const descriptor = await verifyAssetId(c, id);
		if (!descriptor) return new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });

		const asset = await loadAsset(c, descriptor);
		if (!asset?.body) return new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });

		return new Response(base64ToBytes(asset.body), {
			status: 200,
			headers: {
				'Content-Type': asset.contentType || 'application/octet-stream',
				'Cache-Control': 'public, max-age=3600',
				'X-Content-Type-Options': 'nosniff',
				'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
				'Content-Disposition': 'inline',
				'Referrer-Policy': 'no-referrer',
				// The bytes are a public/capability-signed avatar, and the API may be
				// served from a different origin than the SPA in dev/remote setups.
				'Cross-Origin-Resource-Policy': 'cross-origin'
			}
		});
	}
};

export default senderAvatarService;
