import { describe, expect, it } from 'vitest';
import { canonicalize, snapshotHash } from '../src/service/outbound-send-snapshot';

describe('outbound send snapshot canonicalization', () => {
	it('is stable across object key order while retaining recipient order', async () => {
		const first = { subject: 'Frozen', to: ['a@example.com', 'b@example.com'], from: { name: 'Nova', email: 'n@example.com' } };
		const reordered = { from: { email: 'n@example.com', name: 'Nova' }, to: ['a@example.com', 'b@example.com'], subject: 'Frozen' };
		expect(canonicalize(first)).toBe(canonicalize(reordered));
		expect(await snapshotHash(first)).toBe(await snapshotHash(reordered));
		expect(await snapshotHash({ ...first, to: ['b@example.com', 'a@example.com'] })).not.toBe(await snapshotHash(first));
		expect(canonicalize({ optional: undefined })).toBe('{"optional":null}');
	});
});
