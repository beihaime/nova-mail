import { describe, expect, it } from 'vitest';

function canReferenceMessage({ requesterUserId, messageUserId, deleted }) {
	return requesterUserId === messageUserId && !deleted;
}

describe('message relationship ownership', () => {
	it('allows a user to reply to an owned active message', () => {
		expect(canReferenceMessage({ requesterUserId: 1, messageUserId: 1, deleted: false })).toBe(true);
	});

	it('does not distinguish foreign, guessed, and deleted message IDs', () => {
		expect(canReferenceMessage({ requesterUserId: 1, messageUserId: 2, deleted: false })).toBe(false);
		expect(canReferenceMessage({ requesterUserId: 1, messageUserId: 1, deleted: true })).toBe(false);
		expect(canReferenceMessage({ requesterUserId: 1, messageUserId: undefined, deleted: false })).toBe(false);
	});
});
