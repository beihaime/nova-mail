import domainUtils from '../utils/domain-uitls';
import urlSafety from '../utils/url-safety';

const webhookService = {

	async sendEmail(c, emailRow, webhookUrl, retry = 0, webhookSecret) {

		webhookUrl = domainUtils.toOssDomain(webhookUrl);

		if (!webhookUrl) {
			return;
		}

		try {
			webhookUrl = urlSafety.assertSafeWebhookUrl(webhookUrl);
		} catch (e) {
			console.error(`Webhook URL rejected: ${e.message}`);
			return;
		}

		retry = Number(retry);
		if (isNaN(retry) || retry < 0) {
			retry = 0;
		}
		if (retry > 3) {
			retry = 3;
		}

		const headers = {
			'Content-Type': 'application/json'
		};

		if (webhookSecret) {
			headers['Authorization'] = webhookSecret;
		}

		const body = JSON.stringify({
			emailId: emailRow.emailId,
			sendEmail: emailRow.sendEmail,
			sendName: emailRow.name,
			toEmail: emailRow.toEmail,
			toName: emailRow.toName,
			subject: emailRow.subject,
			text: emailRow.text,
			content: emailRow.content,
			code: emailRow.code,
			createTime: emailRow.createTime
		});

		let lastError = '';

		for (let i = 0; i <= retry; i++) {
			try {
				const res = await fetch(webhookUrl, {
					method: 'POST',
					headers,
					body,
					// Do not let an approved public endpoint redirect this signed payload
					// (or the webhook secret) to an internal address.
					redirect: 'manual'
				});

				if (res.ok) {
					return;
				}

				lastError = res.status >= 300 && res.status < 400
					? `redirect rejected: ${res.status}`
					: `status: ${res.status}`;
			} catch (e) {
				lastError = e.message;
			}
		}

		console.error(`Webhook 推送失败: ${lastError}`);
	}

};

export default webhookService;
