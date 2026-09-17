const encoder = new TextEncoder();

const PBKDF2_ITERATIONS = 100000;

const saltHashUtils = {

	generateSalt(length = 16) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return btoa(String.fromCharCode(...array));
	},

	async hashPassword(password) {
		const salt = this.generateSalt();
		const hash = await this.genHashPassword(password, salt);
		return { salt, hash };
	},

	/**
	 * New passwords: PBKDF2-SHA256 with 100k iterations (prefix "pbkdf2:").
	 * Legacy passwords used a single SHA-256(salt + password) digest.
	 */
	async genHashPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
		const keyMaterial = await crypto.subtle.importKey(
			'raw',
			encoder.encode(password),
			'PBKDF2',
			false,
			['deriveBits']
		);

		let saltBytes;
		try {
			saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));
		} catch {
			saltBytes = encoder.encode(salt);
		}

		const derived = await crypto.subtle.deriveBits(
			{
				name: 'PBKDF2',
				salt: saltBytes,
				iterations,
				hash: 'SHA-256'
			},
			keyMaterial,
			256
		);

		const hashB64 = btoa(String.fromCharCode(...new Uint8Array(derived)));
		return `pbkdf2:${iterations}:${hashB64}`;
	},

	async genLegacyHashPassword(password, salt) {
		const data = encoder.encode(salt + password);
		const hashBuffer = await crypto.subtle.digest('SHA-256', data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return btoa(String.fromCharCode(...hashArray));
	},

	async verifyPassword(inputPassword, salt, storedHash) {
		if (!storedHash) return false;

		if (storedHash.startsWith('pbkdf2:')) {
			const parts = storedHash.split(':');
			if (parts.length !== 3) return false;
			const iterations = Number(parts[1]) || PBKDF2_ITERATIONS;
			const computed = await this.genHashPassword(inputPassword, salt, iterations);
			return computed === storedHash;
		}

		// Legacy single-round SHA-256(salt + password)
		const legacy = await this.genLegacyHashPassword(inputPassword, salt);
		return legacy === storedHash;
	},

	isLegacyPasswordHash(storedHash) {
		return typeof storedHash === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(storedHash);
	},

	genRandomPwd(length = 12) {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const bytes = new Uint8Array(length);
		crypto.getRandomValues(bytes);
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(bytes[i] % chars.length);
		}
		return result;
	}
};

export default saltHashUtils;
