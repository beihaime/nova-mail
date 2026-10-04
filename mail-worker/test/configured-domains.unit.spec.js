import { describe, expect, it } from 'vitest';
import { configuredDomains, hasConfiguredDomain } from '../src/utils/configured-domains';

describe('configured mail domains', () => {
	for (const config of [['Example.COM'], '[" Example.COM "]']) {
		it(`uses exact case-insensitive matches for ${JSON.stringify(config)}`, () => {
			expect(configuredDomains(config)).toEqual(['example.com']);
			expect(hasConfiguredDomain(config, 'EXAMPLE.com')).toBe(true);
			for (const rejected of ['ample.com', 'notexample.com', 'example.com.attacker.tld']) {
				expect(hasConfiguredDomain(config, rejected)).toBe(false);
			}
		});
	}
});
