import { describe, expect, it } from 'vitest';
import {
	base64UrlToUint8,
	uint8ToBase64Url,
	buildVapidAuthorization,
	encryptPayload,
	generateVapidKeys,
	hasVapidKeys,
} from '../src/lib/web-push';

/**
 * Web Push has no local server to test against, so the test plays the two other
 * roles of the protocol:
 *   - it verifies the VAPID JWT the way a push service does, and
 *   - it decrypts the `aes128gcm` body the way a browser does (RFC 8291 §3.4).
 * A wrong HKDF label, salt order or record layout fails here instead of in
 * production, where the only symptom would be a silently dropped notification.
 */

const te = new TextEncoder();

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

async function hkdf(salt, ikm, info, length) {
	const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
	return new Uint8Array(bits);
}

/** JWS uses raw r||s; WebCrypto needs DER back. */
function rawToDerSignature(raw) {
	const half = raw.length / 2;
	const toInteger = (bytes) => {
		let value = bytes;
		let index = 0;
		while (index < value.length - 1 && value[index] === 0) index++;
		value = value.slice(index);
		if (value[0] & 0x80) value = concatBytes(new Uint8Array([0]), value);
		return concatBytes(new Uint8Array([0x02, value.length]), value);
	};
	const r = toInteger(raw.slice(0, half));
	const s = toInteger(raw.slice(half));
	const body = concatBytes(r, s);
	return concatBytes(new Uint8Array([0x30, body.length]), body);
}

/** A browser-side subscription: its keys and auth secret. */
async function createSubscription() {
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
async function decryptPayload(body, subscription) {
	const salt = body.slice(0, 16);
	const idLength = body[20];
	const asPublic = body.slice(21, 21 + idLength);
	const ciphertext = body.slice(21 + idLength);

	const authSecret = base64UrlToUint8(subscription.auth);
	const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
		{
			name: 'ECDH',
			public: await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []),
		},
		subscription.pair.privateKey,
		256
	));

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
	expect(plaintext.at(-1)).toBe(0x02);
	return new TextDecoder().decode(plaintext.slice(0, -1));
}

describe('push payload encryption (RFC 8291)', () => {
	it('round-trips a notification payload for the subscribing browser', async () => {
		const subscription = await createSubscription();
		const payload = JSON.stringify({
			title: 'Nova Mail',
			body: '收到来自 dev@beihaime.com 的邮件',
			subject: 'Re: Prompt',
			url: '/mail?emailId=123',
			emailId: 123,
		});

		const body = await encryptPayload({ payload, p256dh: subscription.p256dh, auth: subscription.auth });

		// Header layout: salt(16) | rs(4) | idlen(1) | keyid(65) | ciphertext
		expect(body.length).toBeGreaterThan(16 + 4 + 1 + 65);
		expect(body[20]).toBe(65);
		expect(body[21]).toBe(0x04);
		expect(new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0)).toBe(4096);

		expect(await decryptPayload(body, subscription)).toBe(payload);
	});

	it('produces a different body every time (fresh salt + ephemeral key)', async () => {
		const subscription = await createSubscription();
		const payload = JSON.stringify({ emailId: 1 });

		const first = await encryptPayload({ payload, p256dh: subscription.p256dh, auth: subscription.auth });
		const second = await encryptPayload({ payload, p256dh: subscription.p256dh, auth: subscription.auth });

		expect(uint8ToBase64Url(first)).not.toBe(uint8ToBase64Url(second));
		expect(await decryptPayload(first, subscription)).toBe(payload);
		expect(await decryptPayload(second, subscription)).toBe(payload);
	});

	it('rejects a malformed subscription instead of sending garbage', async () => {
		await expect(encryptPayload({ payload: '{}', p256dh: uint8ToBase64Url(new Uint8Array(10)), auth: uint8ToBase64Url(new Uint8Array(16)) }))
			.rejects.toThrow(/p256dh/);

		const subscription = await createSubscription();
		await expect(encryptPayload({ payload: '{}', p256dh: subscription.p256dh, auth: uint8ToBase64Url(new Uint8Array(4)) }))
			.rejects.toThrow(/auth/);
	});
});

describe('VAPID authorization (RFC 8292)', () => {
	it('signs a verifiable ES256 JWT with the endpoint origin as audience', async () => {
		const keys = await generateVapidKeys();
		expect(base64UrlToUint8(keys.publicKey)).toHaveLength(65);
		expect(base64UrlToUint8(keys.privateKey)).toHaveLength(32);

		const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';
		const header = await buildVapidAuthorization({
			endpoint,
			publicKey: keys.publicKey,
			privateKey: keys.privateKey,
			subject: 'mailto:admin@beihaime.com',
		});

		expect(header.startsWith('vapid t=')).toBe(true);
		const [, tokenPart] = header.split('vapid t=');
		const [jwt, keyPart] = tokenPart.split(', k=');
		expect(keyPart.trim()).toBe(keys.publicKey);

		const [encodedHeader, encodedPayload, encodedSignature] = jwt.split('.');
		expect(JSON.parse(new TextDecoder().decode(base64UrlToUint8(encodedHeader)))).toEqual({ typ: 'JWT', alg: 'ES256' });

		const claims = JSON.parse(new TextDecoder().decode(base64UrlToUint8(encodedPayload)));
		expect(claims.aud).toBe('https://fcm.googleapis.com');
		expect(claims.sub).toBe('mailto:admin@beihaime.com');
		expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

		const publicKeyBytes = base64UrlToUint8(keys.publicKey);
		const verifyKey = await crypto.subtle.importKey('jwk', {
			kty: 'EC',
			crv: 'P-256',
			ext: true,
			x: uint8ToBase64Url(publicKeyBytes.slice(1, 33)),
			y: uint8ToBase64Url(publicKeyBytes.slice(33, 65)),
		}, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);

		// The JWS signature must be the raw 64-byte r||s form.
		const signatureRaw = base64UrlToUint8(encodedSignature);
		expect(signatureRaw).toHaveLength(64);

		const verifyOptions = { name: 'ECDSA', hash: 'SHA-256' };
		const signingBytes = te.encode(`${encodedHeader}.${encodedPayload}`);

		// Node's WebCrypto signs and verifies raw r||s; browsers (and the
		// Workers runtime) use DER. Accept either so the test is portable.
		const validRaw = await crypto.subtle.verify(verifyOptions, verifyKey, signatureRaw, signingBytes);
		const valid = validRaw || await crypto.subtle.verify(
			verifyOptions,
			verifyKey,
			rawToDerSignature(signatureRaw),
			signingBytes
		);
		expect(valid).toBe(true);
	});

	it('detects missing or broken key material', async () => {
		expect(hasVapidKeys('', '')).toBe(false);
		expect(hasVapidKeys(uint8ToBase64Url(new Uint8Array(3)), uint8ToBase64Url(new Uint8Array(32)))).toBe(false);

		const keys = await generateVapidKeys();
		expect(hasVapidKeys(keys.publicKey, keys.privateKey)).toBe(true);
	});
});
