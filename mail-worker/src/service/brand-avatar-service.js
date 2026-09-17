import { eq, and } from 'drizzle-orm';
import email from '../entity/email';
import emailUtils from '../utils/email-utils';
import kvConst from '../const/kv-const';
import urlSafety from '../utils/url-safety';
import orm from '../entity/orm';

const MAX_LOGO_BYTES = 256 * 1024;
const POSITIVE_TTL = 60 * 60 * 24 * 7;
const NEGATIVE_TTL = 60 * 60 * 24;

function base64Encode(bytes) {
	let value = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		value += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(value);
}

function base64Decode(value) {
	const binary = atob(value);
	return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function isTrustedAuthentication(domain, authResults) {
	// Authentication-Results, ARC-Authentication-Results and Received-SPF are
	// part of the raw message and can be supplied by the sender. The Email Worker
	// currently has no trusted verifier-produced binding for these headers, so
	// they must not unlock a brand logo. Keep this gate closed until SPF/DKIM and
	// DMARC are verified by a trusted ingress service and stored with provenance.
	return false;
}

function validDomain(value) {
	const raw = String(value || '').trim();
	if (!raw || /[/?#%\\\s]/.test(raw) || raw.includes('@') || raw.includes(':')) return '';
	let domain = '';
	try {
		domain = new URL(`https://${raw}`).hostname.toLowerCase().replace(/\.$/, '');
	} catch {
		return '';
	}
	return domain.length <= 253 && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)
		? domain
		: '';
}

function safeRemoteUrl(value) {
	try {
		const url = new URL(value);
		if (!['https:', 'http:'].includes(url.protocol)) return null;
		if (url.username || url.password || urlSafety.isPrivateOrLocalHost(url.hostname)) return null;
		return url;
	} catch {
		return null;
	}
}

function timeoutSignal(ms = 5000) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function resolvesToPrivateAddress(hostname) {
	if (urlSafety.isPrivateOrLocalHost(hostname)) return true;
	const { signal, clear } = timeoutSignal(3000);
	try {
		for (const type of ['A', 'AAAA']) {
			const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`, {
				headers: { Accept: 'application/dns-json' }, signal
			});
			if (!response.ok) continue;
			const data = await response.json();
			if ((data.Answer || []).some(answer => urlSafety.isPrivateOrLocalHost(String(answer.data || '')))) return true;
		}
	} catch {
		// A DNS failure is handled as an unavailable logo, not as a direct fetch.
		return true;
	} finally {
		clear();
	}
	return false;
}

async function fetchPublic(url, accept) {
	let current = safeRemoteUrl(url);
	for (let attempt = 0; attempt < 3 && current; attempt += 1) {
		if (await resolvesToPrivateAddress(current.hostname)) return null;
		const { signal, clear } = timeoutSignal();
		try {
			const response = await fetch(current.toString(), { redirect: 'manual', headers: { Accept: accept }, signal });
			if ([301, 302, 303, 307, 308].includes(response.status)) {
				current = safeRemoteUrl(new URL(response.headers.get('location') || '', current).toString());
				continue;
			}
			if (!response.ok) return null;
			const length = Number(response.headers.get('content-length') || 0);
			if (length > MAX_LOGO_BYTES) return null;
			const bytes = new Uint8Array(await response.arrayBuffer());
			if (!bytes.length || bytes.length > MAX_LOGO_BYTES) return null;
			return { bytes, contentType: response.headers.get('content-type') || '' };
		} catch {
			return null;
		} finally {
			clear();
		}
	}
	return null;
}

function sanitizeSvg(bytes) {
	const text = new TextDecoder().decode(bytes);
	if (!/<svg[\s>]/i.test(text)) return null;
	const clean = text
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<!DOCTYPE[\s\S]*?>/gi, '')
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/\s(on[a-z]+|href|xlink:href)\s*=\s*(["'])[^"']*\2/gi, '')
		.replace(/url\(\s*['"]?[^)#]+\)?/gi, 'none');
	if (/<script|javascript:/i.test(clean)) return null;
	return new TextEncoder().encode(clean);
}

async function lookupBimi(domain) {
	const { signal, clear } = timeoutSignal();
	try {
		const response = await fetch(`https://cloudflare-dns.com/dns-query?name=default._bimi.${domain}&type=TXT`, {
			headers: { Accept: 'application/dns-json' }, signal
		});
		if (!response.ok) return null;
		const data = await response.json();
		for (const answer of data.Answer || []) {
			const value = String(answer.data || '').replace(/^"|"$/g, '').replaceAll('" "', '');
			if (!/v=bimi1/i.test(value)) continue;
			const logo = value.match(/(?:^|;)\s*l=([^;\s]+)/i)?.[1];
			if (logo && safeRemoteUrl(logo)?.protocol === 'https:') return logo;
		}
	} catch { /* negative cache handles unavailable DNS */ }
	finally { clear(); }
	return null;
}

async function discover(domain) {
	const bimiUrl = await lookupBimi(domain);
	if (bimiUrl) {
		const asset = await fetchPublic(bimiUrl, 'image/svg+xml,image/*;q=0.8');
		if (asset) {
			const svg = sanitizeSvg(asset.bytes);
			if (svg) return { source: 'bimi', contentType: 'image/svg+xml', body: base64Encode(svg) };
		}
	}

	const favicon = await fetchPublic(`https://${domain}/favicon.ico`, 'image/*');
	if (favicon && (/^image\//i.test(favicon.contentType) || /icon/i.test(favicon.contentType))) {
		return { source: 'favicon', contentType: favicon.contentType.split(';')[0] || 'image/x-icon', body: base64Encode(favicon.bytes) };
	}

	const home = await fetchPublic(`https://${domain}/`, 'text/html');
	if (home && /html/i.test(home.contentType)) {
		const html = new TextDecoder().decode(home.bytes);
		const match = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i)
			|| html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i);
		const iconUrl = match && safeRemoteUrl(new URL(match[1], `https://${domain}/`).toString());
		if (iconUrl) {
			const asset = await fetchPublic(iconUrl.toString(), 'image/*');
			if (asset && (/^image\//i.test(asset.contentType) || /icon/i.test(asset.contentType))) {
				return { source: 'favicon', contentType: asset.contentType.split(';')[0] || 'image/png', body: base64Encode(asset.bytes) };
			}
		}
	}
	return null;
}

const brandAvatarService = {
	async get(c, domain) {
		const key = kvConst.BRAND_LOGO + domain;
		const cached = await c.env.kv.get(key, { type: 'json' });
		if (cached) return cached.body ? cached : null;
		const result = await discover(domain);
		await c.env.kv.put(key, JSON.stringify(result || { source: null, body: null }), { expirationTtl: result ? POSITIVE_TTL : NEGATIVE_TTL });
		return result;
	},

	async response(c, emailId, userId) {
		const row = await ormSelect(c, emailId, userId);
		const domain = validDomain(emailUtils.getDomain(row?.sendEmail));
		if (!row || !domain || !isTrustedAuthentication(domain, row.authResults)) return new Response(null, { status: 404 });
		const logo = await this.get(c, domain);
		if (!logo?.body) return new Response(null, { status: 404 });
		return new Response(base64Decode(logo.body), { status: 200, headers: { 'Content-Type': logo.contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
	}
};

async function ormSelect(c, emailId, userId) {
	return orm(c).select({ sendEmail: email.sendEmail, authResults: email.authResults }).from(email)
		.where(and(eq(email.emailId, emailId), eq(email.userId, userId))).get();
}

export { isTrustedAuthentication, validDomain };
export default brandAvatarService;
