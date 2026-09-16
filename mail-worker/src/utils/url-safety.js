import BizError from '../error/biz-error';

function isPrivateOrLocalHost(hostname) {
	const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');

	if (!h) return true;
	if (h === 'localhost' || h.endsWith('.localhost')) return true;
	if (h === 'metadata.google.internal') return true;

	// IPv6 local / link-local / ULA
	if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
	if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;

	// IPv4 dotted
	const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (m) {
		const a = m.slice(1).map(Number);
		if (a.some(n => n > 255)) return true;
		const [o1, o2] = a;
		if (o1 === 0 || o1 === 10 || o1 === 127) return true;
		if (o1 === 169 && o2 === 254) return true; // link-local / cloud metadata
		if (o1 === 192 && o2 === 168) return true;
		if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
		if (o1 === 100 && o2 >= 64 && o2 <= 127) return true; // CGNAT
		if (o1 === 192 && o2 === 0 && a[2] === 0) return true;
		if (o1 >= 224) return true; // multicast / reserved
	}

	return false;
}

/**
 * Validate outbound webhook URL (admin-configured).
 * Blocks private / loopback / link-local / metadata endpoints to reduce SSRF risk.
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

	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new BizError('Webhook URL must be http or https');
	}

	if (isPrivateOrLocalHost(url.hostname)) {
		throw new BizError('Webhook URL must not target private or local hosts');
	}

	return url.toString();
}

export default { assertSafeWebhookUrl, isPrivateOrLocalHost };
