import BizError from '../error/biz-error';

const metadataHostnames = new Set([
	'metadata.google.internal',
	'metadata.azure.internal',
	'metadata.aws',
	'instance-data',
	'instance-data.ec2.internal'
]);

function normalizeHostname(hostname) {
	let normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
	// A fully-qualified DNS name may have one terminal root label. Normalize it
	// before policy checks so localhost. cannot bypass localhost.
	if (normalized.endsWith('.')) normalized = normalized.slice(0, -1);
	return normalized;
}

function parseIpv4(hostname) {
	const parts = hostname.split('.');
	if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null;
	const octets = parts.map(Number);
	return octets.some(octet => octet > 255) ? null : octets;
}

function isBlockedIpv4(octets) {
	const [a, b, c] = octets;
	return a === 0 // "this" network / unspecified
		|| a === 10
		|| a === 100 && b >= 64 && b <= 127 // shared address space
		|| a === 127
		|| a === 169 && b === 254
		|| a === 172 && b >= 16 && b <= 31
		|| a === 192 && b === 0 && c === 0
		|| a === 192 && b === 0 && c === 2 // TEST-NET-1
		|| a === 192 && b === 168
		|| a === 198 && (b === 18 || b === 19) // benchmarking
		|| a === 198 && b === 51 && c === 100 // TEST-NET-2
		|| a === 203 && b === 0 && c === 113 // TEST-NET-3
		|| a >= 224; // multicast, reserved, and limited broadcast
}

function parseIpv6Side(side) {
	if (!side) return [];
	const parts = side.split(':');
	const ipv4Index = parts.findIndex(part => part.includes('.'));
	if (ipv4Index !== -1) {
		if (ipv4Index !== parts.length - 1) return null;
		const ipv4 = parseIpv4(parts[ipv4Index]);
		if (!ipv4) return null;
		parts.splice(ipv4Index, 1, ((ipv4[0] << 8) | ipv4[1]).toString(16), ((ipv4[2] << 8) | ipv4[3]).toString(16));
	}
	if (parts.some(part => !/^[0-9a-f]{1,4}$/i.test(part))) return null;
	return parts.map(part => Number.parseInt(part, 16));
}

function parseIpv6(hostname) {
	if (!hostname.includes(':') || (hostname.match(/::/g) || []).length > 1) return null;
	const hasCompression = hostname.includes('::');
	const [leftText, rightText] = hasCompression ? hostname.split('::') : [hostname, ''];
	const left = parseIpv6Side(leftText);
	const right = parseIpv6Side(rightText);
	if (!left || !right) return null;

	const explicitCount = left.length + right.length;
	if (explicitCount > 8 || (!hasCompression && explicitCount !== 8)) return null;
	if (!hasCompression) return left;

	const zeroCount = 8 - explicitCount;
	return zeroCount > 0 ? [...left, ...Array(zeroCount).fill(0), ...right] : null;
}

function isBlockedIpv6(groups) {
	if (!groups || groups.length !== 8) return false;
	const allZero = groups.every(group => group === 0);
	const loopback = groups.slice(0, 7).every(group => group === 0) && groups[7] === 1;
	const ipv4Mapped = groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff;
	if (allZero || loopback) return true;
	if (ipv4Mapped) return isBlockedIpv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]);

	const first = groups[0];
	return (first & 0xffc0) === 0xfe80 // link-local fe80::/10
		|| (first & 0xfe00) === 0xfc00 // unique local fc00::/7
		|| (first & 0xff00) === 0xff00 // multicast ff00::/8
		|| (first === 0x0100 && groups.slice(1, 4).every(group => group === 0)) // discard-only 100::/64
		|| (first === 0x2001 && groups[1] === 0x0db8); // documentation 2001:db8::/32
}

function isPrivateOrLocalHost(hostname) {
	const h = normalizeHostname(hostname);
	if (!h || h === 'localhost' || h.endsWith('.localhost') || metadataHostnames.has(h)) return true;

	const ipv4 = parseIpv4(h);
	if (ipv4) return isBlockedIpv4(ipv4);

	const ipv6 = parseIpv6(h);
	return ipv6 ? isBlockedIpv6(ipv6) : false;
}

/**
 * Validate an administrator-configured webhook URL before outbound delivery.
 * Hostname DNS answers cannot be pinned by Workers' fetch API, so this covers
 * URL/literal-IP policy only; deployments accepting arbitrary hostnames need
 * an egress allowlist or proxy for DNS-rebinding protection.
 */
function assertSafeWebhookUrl(urlStr) {
	if (!urlStr || typeof urlStr !== 'string') {
		throw new BizError('Invalid webhook URL');
	}

	let url;
	try {
		url = new URL(urlStr);
	} catch {
		throw new BizError('Invalid webhook URL');
	}

	if (url.protocol !== 'https:') {
		throw new BizError('Webhook URL must use HTTPS');
	}

	const hostname = normalizeHostname(url.hostname);
	if (isPrivateOrLocalHost(hostname)) {
		throw new BizError('Webhook URL must not target private or local hosts');
	}

	url.hostname = hostname;
	return url.toString();
}

export default { assertSafeWebhookUrl, isPrivateOrLocalHost, normalizeHostname, parseIpv4, parseIpv6 };
