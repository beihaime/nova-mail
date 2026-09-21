/**
 * BIMI (Brand Indicators for Message Identification) record parsing.
 *
 * Pure helpers only — no DNS, no network — so both the inbound pipeline
 * (`email/email.js` keeps the message's `BIMI-Selector` header) and the avatar
 * resolver can share exactly one parser.
 *
 * Two different inputs are handled here and they must not be confused:
 *
 *  - `BIMI-Selector:` is a *message header* (`v=BIMI1; s=selector`). It is
 *    sender-controlled input, so it is only ever used to pick which DNS record
 *    to read — never as proof of anything.
 *  - The `selector._bimi.<domain>` *TXT record* (`v=BIMI1; l=…; a=…; avp=…`)
 *    is the authority statement. `l=` is the logo URL, `a=` the authority
 *    evidence (VMC) URL and `avp=` the authority evidence location; only `l=`
 *    ever points at an image.
 */

/** Selector used when the message carries no usable `BIMI-Selector` header. */
export const DEFAULT_BIMI_SELECTOR = 'default';

/**
 * Validate a BIMI selector as a single DNS label (RFC 1035, 63 octets max).
 * Returns the lower-cased selector, or '' when it is not usable.
 */
export function validBimiSelector(value) {
	const selector = String(value || '').trim().toLowerCase();
	if (!selector || selector.length > 63) return '';
	return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(selector) ? selector : '';
}

/**
 * Split a `;`-separated tag list (`v=BIMI1; l=https://…`) into a lower-cased
 * key map. The first occurrence of a tag wins, matching BIMI's "ignore unknown
 * and duplicated tags" rule.
 */
export function parseTagList(value) {
	const fields = {};
	for (const part of String(value || '').split(';')) {
		const index = part.indexOf('=');
		if (index < 0) continue;
		const key = part.slice(0, index).trim().toLowerCase();
		if (!key || fields[key] !== undefined) continue;
		fields[key] = part.slice(index + 1).trim();
	}
	return fields;
}

/**
 * Parse a `BIMI-Selector:` header value (`v=BIMI1; s=selector`).
 *
 * Returns the validated selector, or '' when the header is absent, malformed,
 * not `v=BIMI1`, or names a selector that is not a legal DNS label. The caller
 * then falls back to `default`.
 */
export function parseBimiSelectorHeader(value) {
	const raw = Array.isArray(value) ? value[0] : value;
	if (!raw || typeof raw !== 'string') return '';
	const fields = parseTagList(raw);
	if (String(fields.v || '').toLowerCase() !== 'bimi1') return '';
	return validBimiSelector(fields.s);
}

/**
 * Join a DNS TXT character-string back into one value.
 *
 * DoH returns the record already assembled, but different resolvers quote and
 * split long strings differently (`"v=BIMI1; l=…" ";"`), so quotes are stripped
 * and adjacent quoted chunks are concatenated.
 */
export function normalizeTxtValue(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return '';
	return raw
		.replace(/"\s*"/g, '')
		.replace(/^"|"$/g, '')
		.trim();
}

/**
 * Parse a BIMI TXT record.
 *
 * @returns {{v: string, l: string, a: string, avp: string}|null} `null` when the
 *   value is not a `v=BIMI1` record (a DKIM key, an SPF record, a decline).
 */
export function parseBimiRecord(value) {
	const text = normalizeTxtValue(value);
	if (!text) return null;

	const fields = parseTagList(text);
	if (String(fields.v || '').toLowerCase() !== 'bimi1') return null;

	return {
		v: 'BIMI1',
		l: fields.l || '',
		a: fields.a || '',
		avp: fields.avp || ''
	};
}

/**
 * The DNS name that holds the BIMI record for a domain + selector.
 * `default._bimi.example.com` unless the message asked for another selector.
 */
export function bimiRecordName(domain, selector) {
	const safeSelector = validBimiSelector(selector) || DEFAULT_BIMI_SELECTOR;
	return `${safeSelector}._bimi.${String(domain || '').trim().toLowerCase()}`;
}
