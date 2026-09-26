/**
 * Web Push (RFC 8030 / 8291 / 8292) with nothing but WebCrypto.
 *
 * Cloudflare Workers expose `crypto.subtle` with ECDH, HKDF, AES-GCM and
 * ECDSA, which is everything Web Push needs — so this module has no
 * dependencies and runs unchanged in Node for the unit tests.
 *
 * `encryptPayload` produces an `aes128gcm` request body; `buildVapidHeaders`
 * produces the signed `Authorization` header. The caller only has to POST.
 */

const textEncoder = new TextEncoder();

/** 4096-byte records, the smallest value every push service accepts. */
const RECORD_SIZE = 4096;

const HKDF_INFO = textEncoder.encode('WebPush: info\0');
const AES128GCM_INFO = textEncoder.encode('Content-Encoding: aes128gcm\0');
const NONCE_INFO = textEncoder.encode('Content-Encoding: nonce\0');

/** VAPID tokens may not live longer than 24h; 12h is the common choice. */
const VAPID_TTL_SECONDS = 12 * 60 * 60;

export function base64UrlToUint8(value) {
	const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export function uint8ToBase64Url(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBytes(...arrays) {
	const total = arrays.reduce((sum, array) => sum + array.length, 0);
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const array of arrays) {
		merged.set(array, offset);
		offset += array.length;
	}
	return merged;
}

function uint32BE(value) {
	return new Uint8Array([
		(value >>> 24) & 0xff,
		(value >>> 16) & 0xff,
		(value >>> 8) & 0xff,
		value & 0xff,
	]);
}

/**
 * HKDF-Extract + HKDF-Expand in one call, which is exactly what WebCrypto's
 * HKDF implementation does.
 */
async function hkdf(salt, ikm, info, length) {
	const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt, info },
		key,
		length * 8
	);
	return new Uint8Array(bits);
}

/* ------------------------------------------------------------------ VAPID */

/**
 * Rebuild an importable EC JWK from the raw VAPID material:
 * the 65-byte uncompressed public point and the 32-byte private scalar.
 */
function vapidJwk(publicKeyBytes, privateKeyBytes) {
	if (publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 0x04) {
		throw new Error('VAPID public key must be a 65-byte uncompressed P-256 point');
	}
	if (privateKeyBytes.length !== 32) {
		throw new Error('VAPID private key must be a 32-byte P-256 scalar');
	}

	return {
		kty: 'EC',
		crv: 'P-256',
		ext: true,
		d: uint8ToBase64Url(privateKeyBytes),
		x: uint8ToBase64Url(publicKeyBytes.slice(1, 33)),
		y: uint8ToBase64Url(publicKeyBytes.slice(33, 65)),
	};
}

/**
 * JWS wants a raw `r||s` signature.
 *
 * Browsers hand `crypto.subtle.sign` ECDSA results back as DER, while Node's
 * WebCrypto returns the raw 64 bytes. A P-256 DER signature is always 68–72
 * bytes, so the length is an unambiguous discriminator.
 */
function signatureToRaw(signature, length = 64) {
	const bytes = new Uint8Array(signature);
	if (bytes.length === length) return bytes;
	if (bytes[0] !== 0x30) throw new Error('unexpected ECDSA signature format');

	let offset = 1;
	let sequenceLength = bytes[offset++];
	if (sequenceLength & 0x80) {
		const count = sequenceLength & 0x7f;
		sequenceLength = 0;
		for (let i = 0; i < count; i++) sequenceLength = (sequenceLength << 8) | bytes[offset++];
	}

	const readInteger = () => {
		if (bytes[offset++] !== 0x02) throw new Error('unexpected ECDSA signature format');
		let size = bytes[offset++];
		if (size & 0x80) {
			const count = size & 0x7f;
			size = 0;
			for (let i = 0; i < count; i++) size = (size << 8) | bytes[offset++];
		}
		let value = bytes.slice(offset, offset + size);
		offset += size;
		// DER integers are signed: drop the leading zero padding.
		while (value.length > 1 && value[0] === 0) value = value.slice(1);
		return value;
	};

	const half = length / 2;
	const r = readInteger();
	const s = readInteger();

	if (r.length > half || s.length > half) {
		throw new Error('unexpected ECDSA signature size');
	}

	const raw = new Uint8Array(length);
	raw.set(r, half - r.length);
	raw.set(s, length - s.length);
	return raw;
}

/**
 * Signed VAPID header for one push endpoint.
 *
 * @param {object} params
 * @param {string} params.endpoint subscription endpoint (its origin is the JWT audience)
 * @param {string} params.publicKey base64url uncompressed P-256 point
 * @param {string} params.privateKey base64url 32-byte scalar
 * @param {string} params.subject `mailto:` or `https:` contact for the push service
 * @returns {Promise<string>} value for the `Authorization` header
 */
export async function buildVapidAuthorization({ endpoint, publicKey, privateKey, subject }) {
	const publicKeyBytes = base64UrlToUint8(publicKey);
	const privateKeyBytes = base64UrlToUint8(privateKey);
	const audience = new URL(endpoint).origin;

	const header = uint8ToBase64Url(textEncoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const payload = uint8ToBase64Url(textEncoder.encode(JSON.stringify({
		aud: audience,
		exp: Math.floor(Date.now() / 1000) + VAPID_TTL_SECONDS,
		sub: subject,
	})));
	const signingInput = `${header}.${payload}`;

	const key = await crypto.subtle.importKey(
		'jwk',
		vapidJwk(publicKeyBytes, privateKeyBytes),
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key,
		textEncoder.encode(signingInput)
	);

	const jwt = `${signingInput}.${uint8ToBase64Url(signatureToRaw(signature))}`;
	return `vapid t=${jwt}, k=${uint8ToBase64Url(publicKeyBytes)}`;
}

/* -------------------------------------------------------------- encryption */

/**
 * Encrypt one notification payload for a subscription (`aes128gcm`).
 *
 * @param {object} params
 * @param {string|Uint8Array} params.payload JSON string to deliver
 * @param {string} params.p256dh base64url 65-byte user agent public key
 * @param {string} params.auth base64url 16-byte auth secret
 * @returns {Promise<Uint8Array>} request body
 */
export async function encryptPayload({ payload, p256dh, auth }) {
	const plaintext = typeof payload === 'string' ? textEncoder.encode(payload) : payload;
	const uaPublic = base64UrlToUint8(p256dh);
	const authSecret = base64UrlToUint8(auth);

	if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
		throw new Error('subscription p256dh must be a 65-byte uncompressed P-256 point');
	}
	if (authSecret.length !== 16) {
		throw new Error('subscription auth secret must be 16 bytes');
	}

	const ephemeral = await crypto.subtle.generateKey(
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		['deriveBits']
	);
	const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

	const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
		{ name: 'ECDH', public: await crypto.subtle.importKey(
			'raw',
			uaPublic,
			{ name: 'ECDH', namedCurve: 'P-256' },
			false,
			[]
		) },
		ephemeral.privateKey,
		256
	));

	// RFC 8291 §3.4: IKM binds both public keys and the subscription auth secret.
	const ikm = await hkdf(
		authSecret,
		sharedSecret,
		concatBytes(HKDF_INFO, uaPublic, asPublic),
		32
	);

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const contentEncryptionKey = await hkdf(salt, ikm, AES128GCM_INFO, 16);
	const nonce = await hkdf(salt, ikm, NONCE_INFO, 12);

	const key = await crypto.subtle.importKey('raw', contentEncryptionKey, 'AES-GCM', false, ['encrypt']);
	// 0x02 marks the final record (RFC 8188 padding delimiter).
	const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: nonce, tagLength: 128 },
		key,
		concatBytes(plaintext, new Uint8Array([0x02]))
	));

	return concatBytes(
		salt,
		uint32BE(RECORD_SIZE),
		new Uint8Array([asPublic.length]),
		asPublic,
		ciphertext
	);
}

/* ------------------------------------------------------------- key material */

/**
 * Create a fresh VAPID key pair. Used by `scripts/generate-vapid-keys.mjs`;
 * the Worker only ever imports the two values.
 */
export async function generateVapidKeys() {
	const pair = await crypto.subtle.generateKey(
		{ name: 'ECDSA', namedCurve: 'P-256' },
		true,
		['sign', 'verify']
	);

	const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
	const x = base64UrlToUint8(jwk.x);
	const y = base64UrlToUint8(jwk.y);
	const publicKey = new Uint8Array(65);
	publicKey[0] = 0x04;
	publicKey.set(x, 1);
	publicKey.set(y, 33);

	return {
		publicKey: uint8ToBase64Url(publicKey),
		privateKey: jwk.d,
	};
}

/** True when both VAPID values look usable; the feature stays off otherwise. */
export function hasVapidKeys(publicKey, privateKey) {
	try {
		return base64UrlToUint8(publicKey).length === 65
			&& base64UrlToUint8(privateKey).length === 32;
	} catch {
		return false;
	}
}
