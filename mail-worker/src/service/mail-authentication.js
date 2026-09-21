/**
 * Brand-avatar authentication gate.
 *
 * A BIMI logo is a *brand claim*: showing it as verified tells the reader
 * "this really is paypal.com". That claim is only as good as the SPF/DKIM/DMARC
 * result behind it, and in this deployment the ingress has no trusted verifier
 * yet — `email.auth_results` is deliberately stored empty because an
 * `Authentication-Results:` header that arrives inside the message is
 * sender-controlled and must never unlock a brand logo.
 *
 * Two ways to unlock it, both requiring provenance:
 *
 *  1. `registerAuthenticationVerifier(fn)` — a trusted ingress (a Worker that
 *     ran SPF/DKIM/DMARC itself, a mail gateway, a queue consumer) installs a
 *     synchronous verifier at startup. It receives `{ authResults, domain }`
 *     and returns `true` only for a verified, domain-aligned result.
 *  2. The stored `auth_results` value is a JSON provenance record written by
 *     that same trusted ingress:
 *     `{"source":"trusted-ingress","spf":"pass","dkim":"pass","dmarc":"pass","headerFrom":"example.com"}`
 *     Raw header text is never trusted.
 *
 * Until one of those exists every BIMI avatar resolves with `verified: false`.
 */

/** Provenance markers accepted on a stored JSON authentication result. */
const TRUSTED_PROVENANCE = new Set(['trusted-ingress', 'cloudflare-email-routing', 'gateway']);

let installedVerifier = null;

/**
 * Reserve the verification interface. Call with `null` to remove a verifier.
 * @param {(input: {authResults: string, domain: string}) => boolean} verifier
 */
export function registerAuthenticationVerifier(verifier) {
	installedVerifier = typeof verifier === 'function' ? verifier : null;
}

/** True when `headerFrom` and `domain` are equal or in a parent/child relation. */
export function alignedDomains(headerFrom, domain) {
	const a = String(headerFrom || '').trim().toLowerCase().replace(/\.$/, '');
	const b = String(domain || '').trim().toLowerCase().replace(/\.$/, '');
	if (!a || !b) return false;
	return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function passed(value) {
	return String(value || '').trim().toLowerCase() === 'pass';
}

/**
 * Read a stored JSON provenance record. Anything else — including a raw
 * `Authentication-Results:` header — is untrusted and returns false.
 */
export function parseProvenanceRecord(authResults) {
	const raw = typeof authResults === 'string' ? authResults.trim() : '';
	if (!raw || raw[0] !== '{') return null;

	let record;
	try {
		record = JSON.parse(raw);
	} catch {
		return null;
	}

	if (!record || typeof record !== 'object') return null;
	if (!TRUSTED_PROVENANCE.has(String(record.source || '').trim().toLowerCase())) return null;

	return record;
}

/**
 * Decide whether a domain's BIMI logo may be presented as a verified brand.
 *
 * @param {{authResults?: string, domain?: string}} input
 * @returns {boolean}
 */
export function verifyBrandAuthentication({ authResults, domain } = {}) {
	if (installedVerifier) {
		try {
			if (installedVerifier({ authResults: String(authResults || ''), domain: String(domain || '') }) === true) {
				return true;
			}
		} catch {
			// A broken verifier must fail closed, never unlock a brand.
		}
	}

	const record = parseProvenanceRecord(authResults);
	if (!record) return false;

	if (String(record.dmarc || '').trim().toLowerCase() !== 'pass') return false;
	if (!alignedDomains(record.headerFrom ?? record.header_from, domain)) return false;

	// DMARC pass plus at least one aligned authentication mechanism.
	return passed(record.dkim) || passed(record.spf);
}
