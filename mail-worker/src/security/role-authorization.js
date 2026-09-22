function isSubset(values, allowedValues) {
	const allowed = new Set(allowedValues);
	return values.every((value) => allowed.has(value));
}

function canDelegateLimit(requested, available) {
	const requestedLimit = Number(requested ?? 0);
	const availableLimit = Number(available ?? 0);

	if (!Number.isInteger(requestedLimit) || requestedLimit < 0) {
		return false;
	}

	return availableLimit === 0 || requestedLimit <= availableLimit;
}

function canDelegateRole({ actorPermIds, existingPermIds = [], requestedButtonPermIds, requestedPermKeys, actorRole, requestedRole }) {
	if (!isSubset(existingPermIds, actorPermIds) || !isSubset(requestedButtonPermIds, actorPermIds)) {
		return false;
	}

	if (requestedPermKeys.includes('email:send')) {
		if (requestedRole.sendType !== actorRole.sendType || !canDelegateLimit(requestedRole.sendCount, actorRole.sendCount)) {
			return false;
		}
	}

	if (requestedPermKeys.includes('account:add') && !canDelegateLimit(requestedRole.accountCount, actorRole.accountCount)) {
		return false;
	}

	const actorDomains = String(actorRole.availDomain ?? '').split(',').filter(Boolean);
	const requestedDomains = String(requestedRole.availDomain ?? '').split(',').filter(Boolean);
	return actorDomains.length === 0 || isSubset(requestedDomains, actorDomains);
}

export { canDelegateRole };
