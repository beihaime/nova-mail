import BizError from '../error/biz-error';
import KvConst from '../const/kv-const';
import reqUtils from './req-utils';

/**
 * Simple KV counter rate limit (per IP + action).
 * @param {number} limit max requests in the window
 * @param {number} windowSeconds TTL window in seconds
 */
async function check(c, action, limit, windowSeconds) {
	const ip = reqUtils.getIp(c) || 'unknown';
	const key = `${KvConst.RATE_LIMIT}${action}:${ip}`;

	const current = Number(await c.env.kv.get(key)) || 0;

	if (current >= limit) {
		throw new BizError(`请求过于频繁，请稍后再试 / Too many requests, try again later`, 429);
	}

	await c.env.kv.put(key, String(current + 1), { expirationTtl: windowSeconds });
}

const rateLimitUtils = {
	/** Password login: 10 attempts / minute / IP */
	async login(c) {
		await check(c, 'login', 10, 60);
	},

	/** Register: 5 attempts / minute / IP */
	async register(c) {
		await check(c, 'register', 5, 60);
	}
};

export default rateLimitUtils;
