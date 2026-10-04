import BizError from '../error/biz-error';

/** Canonical configured mail domains; never compare against raw JSON text. */
export function configuredDomains(value) {
	if (value == null || value === '') throw new BizError('Domain configuration is missing');
	let domains = value;
	if (typeof domains === 'string') {
		try { domains = JSON.parse(domains); }
		catch { throw new BizError('Invalid domain configuration'); }
	}
	if (!Array.isArray(domains) || !domains.length) throw new BizError('Invalid domain configuration');
	return [...new Set(domains.map(value => {
		if (typeof value !== 'string') throw new BizError('Invalid domain configuration');
		const domain = value.trim().toLowerCase().replace(/\.$/, '');
		if (domain.length > 253 || !domain.includes('.') || domain.split('.').some(label =>
			!label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
		)) throw new BizError('Invalid domain configuration');
		return domain;
	}))];
}

export function hasConfiguredDomain(value, domain) {
	return configuredDomains(value).includes(String(domain || '').trim().toLowerCase());
}
