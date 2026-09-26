/**
 * Test double for the browser half of Web Push.
 *
 * The tests have no real push service, so they play the user agent: create a
 * subscription key pair, and decrypt/verify what the Worker produced using the
 * same RFC 8291 / 8292 steps a browser performs.
 */

const te = new TextEncoder();

export function concatBytes(...arrays) {
	const total = arrays.reduce((sum, array) => sum + array.length, 0);
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const array of arrays) {
		merged.set(array, offset);
		offset += array.length;
	}
	return merged;
}

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

export async function hkdf(salt, ikm, info, length) {
	const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
	return new Uint8Array(bits);
}

/** JWS uses raw r||s; WebCrypto needs DER back. */
export function rawToDerSignature(raw) {
	const half = raw.length / 2;
	const toInteger = (bytes) => {
		let value = bytes;
		let index = 0;
		while (index < value.length - 1 && value[index] === 0) index++;
		value = value.slice(index);
		if (value[0] & 0x80) value = concatBytes(new Uint8Array([0]), value);
		return concatBytes(new Uint8Array([0x02, value.length]), value);
	};
	const body = concatBytes(toInteger(raw.slice(0, half)), toInteger(raw.slice(half)));
	return concatBytes(new Uint8Array([0x30, body.length]), body);
}

/** A browser-side subscription: its keys and auth secret. */
export async function createSubscription() {
	const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
	const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));

	return {
		pair,
		p256dh: uint8ToBase64Url(publicKey),
		auth: uint8ToBase64Url(crypto.getRandomValues(new Uint8Array(16))),
		publicKey,
	};
}

/** Decrypt an `aes128gcm` push body exactly like a user agent. */
export async function decryptPayload(body, subscription) {
	const idLength = body[20];
	const salt = body.slice(0, 16);
	const asPublic = body.slice(21, 21 + idLength);
	const ciphertext = body.slice(21 + idLength);

	const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
		{
			name: 'ECDH',
			public: await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []),
		},
		subscription.pair.privateKey,
		256
	));

	const authSecret = base64UrlToUint8(subscription.auth);
	const ikm = await hkdf(
		authSecret,
		sharedSecret,
		concatBytes(te.encode('WebPush: info\0'), subscription.publicKey, asPublic),
		32
	);
	const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
	const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

	const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
	const plaintext = new Uint8Array(await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: nonce, tagLength: 128 },
		key,
		ciphertext
	));

	// Strip the final-record padding delimiter (0x02).
	if (plaintext.at(-1) !== 0x02) throw new Error('missing padding delimiter');
	return new TextDecoder().decode(plaintext.slice(0, -1));
}

/** Verify a `vapid t=…, k=…` Authorization header. */
export async function verifyVapidHeader(header) {
	const token = String(header).replace(/^vapid t=/, '').split(', k=')[0];
	const publicKey = String(header).split(', k=')[1]?.trim();
	const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
	const publicKeyBytes = base64UrlToUint8(publicKey);

	const key = await crypto.subtle.importKey('jwk', {
		kty: 'EC',
		crv: 'P-256',
		ext: true,
		x: uint8ToBase64Url(publicKeyBytes.slice(1, 33)),
		y: uint8ToBase64Url(publicKeyBytes.slice(33, 65)),
	}, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);

	const options = { name: 'ECDSA', hash: 'SHA-256' };
	const signingBytes = te.encode(`${encodedHeader}.${encodedPayload}`);
	const signature = base64UrlToUint8(encodedSignature);

	// Node signs/verifies raw r||s; browsers and Workers use DER.
	const valid = await crypto.subtle.verify(options, key, signature, signingBytes)
		|| await crypto.subtle.verify(options, key, rawToDerSignature(signature), signingBytes);

	return {
		valid,
		claims: JSON.parse(new TextDecoder().decode(base64UrlToUint8(encodedPayload))),
		publicKey,
	};
}
