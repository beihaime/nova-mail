import { describe, expect, it } from 'vitest';
import { canAssignRole, canDelegateRole } from '../src/security/role-authorization';

const actorRole = { sendType: 'count', sendCount: 25, accountCount: 3, availDomain: 'example.com' };

describe('delegated role management', () => {
	const manager = { email: 'manager@example.com', role: actorRole };
	const administrator = { email: 'admin@example.com', role: null };
	const managerPerms = [1, 2];
	const safeRole = { roleId: 10, sendType: 'count', sendCount: 10, accountCount: 2, availDomain: 'example.com' };
	const adminRole = { roleId: 99, sendType: 'count', sendCount: 0, accountCount: 0, availDomain: '' };
	const safePerms = [{ permId: 1, permKey: 'email:send', type: 2 }];
	const adminPerms = [{ permId: 99, permKey: 'setting:set', type: 2 }];

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

	it('prevents /api/user/setType from promoting the delegated manager or another user', () => {
		for (const targetUser of [
			{ email: 'manager@example.com', type: 10 },
			{ email: 'other@example.com', type: 10 }
		]) {
			expect(canAssignRole({
				actor: manager,
				targetUser,
				destinationRole: adminRole,
				actorPermIds: managerPerms,
				targetPermIds: [1],
				destinationPerms: adminPerms,
				configuredAdmin: 'admin@example.com'
			})).toBe(false);
		}
	});

	it('prevents /api/user/add and registration-key assignment from creating a privileged account', () => {
		expect(canAssignRole({
			actor: manager,
			targetUser: { email: 'new-user@example.com' },
			destinationRole: adminRole,
			actorPermIds: managerPerms,
			targetPermIds: [],
			destinationPerms: adminPerms,
			configuredAdmin: 'admin@example.com'
		})).toBe(false);
	});

	it('rejects assignment to the configured super-admin identity', () => {
		expect(canAssignRole({
			actor: administrator,
			targetUser: { email: 'ADMIN@example.com', type: 10 },
			destinationRole: safeRole,
			actorPermIds: [],
			targetPermIds: [],
			destinationPerms: safePerms,
			configuredAdmin: 'admin@example.com'
		})).toBe(false);
	});

	it('allows the configured administrator to assign a normal role', () => {
		expect(canAssignRole({
			actor: administrator,
			targetUser: { email: 'other@example.com', type: 10 },
			destinationRole: safeRole,
			actorPermIds: [],
			targetPermIds: [],
			destinationPerms: safePerms,
			configuredAdmin: 'admin@example.com'
		})).toBe(true);
	});

	it('allows a delegated manager to make an ordinary safe role change', () => {
		expect(canAssignRole({
			actor: manager,
			targetUser: { email: 'other@example.com', type: 10 },
			destinationRole: safeRole,
			actorPermIds: managerPerms,
			targetPermIds: [1],
			destinationPerms: safePerms,
			configuredAdmin: 'admin@example.com'
		})).toBe(true);
	});
});
