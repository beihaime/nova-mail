import { describe, expect, it } from 'vitest';
import { canDelegateRole } from '../src/security/role-authorization';

const actorRole = { sendType: 'count', sendCount: 25, accountCount: 3, availDomain: 'example.com' };

describe('delegated role management', () => {
	it('rejects a role that contains a permission the actor does not hold', () => {
		expect(canDelegateRole({
			actorPermIds: [1],
			requestedButtonPermIds: [1, 2],
			requestedPermKeys: [],
			actorRole,
			requestedRole: { availDomain: 'example.com' }
		})).toBe(false);
	});

	it('rejects escalation of send quotas and allowed domains', () => {
		expect(canDelegateRole({
			actorPermIds: [1],
			requestedButtonPermIds: [1],
			requestedPermKeys: ['email:send'],
			actorRole,
			requestedRole: { sendType: 'count', sendCount: 26, availDomain: 'other.example' }
		})).toBe(false);
	});

	it('allows a role whose permissions and resource limits are a subset of the actor role', () => {
		expect(canDelegateRole({
			actorPermIds: [1, 2],
			existingPermIds: [1],
			requestedButtonPermIds: [1],
			requestedPermKeys: ['email:send'],
			actorRole,
			requestedRole: { sendType: 'count', sendCount: 10, availDomain: 'example.com' }
		})).toBe(true);
	});
});
