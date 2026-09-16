import BizError from '../error/biz-error';
import { t } from '../i18n/i18n'

const turnstileService = {

	async verify(c, token) {

		if (!token) {
			throw new BizError(t('emptyBotToken'),400);
		}

		const secret = c.env.TURNSTILE_SECRET_KEY;
		if (!secret) {
			// A missing server-side credential must fail closed. Site keys are public,
			// but accepting a token without Siteverify would turn Turnstile into UI only.
			throw new BizError(t('botVerifyFail'), 503);
		}

		const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: new URLSearchParams({
				secret,
				response: token,
				remoteip: c.req.header('cf-connecting-ip')
			})
		});

		const result = await res.json();

		if (!result.success || (c.env.TURNSTILE_HOSTNAME && result.hostname !== c.env.TURNSTILE_HOSTNAME)) {
			throw new BizError(t('botVerifyFail'),400)
		}
	}
};

export default turnstileService;
