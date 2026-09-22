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

function isConfiguredAdmin(email, configuredAdmin) {
	return typeof email === 'string'
		&& typeof configuredAdmin === 'string'
		&& email.trim().toLowerCase() === configuredAdmin.trim().toLowerCase();
}

function canAssignRole({ actor, targetUser, destinationRole, actorPermIds, targetPermIds, destinationPerms, configuredAdmin }) {
	if (!actor || !destinationRole || isConfiguredAdmin(targetUser?.email, configuredAdmin)) {
		return false;
	}

	if (isConfiguredAdmin(actor.email, configuredAdmin)) {
		return true;
	}

	if (!actor.role) {
		return false;
	}

	const destinationButtonPerms = destinationPerms
		.filter(permission => permission.type === 2);

	return canDelegateRole({
		actorPermIds,
		existingPermIds: targetPermIds,
		requestedButtonPermIds: destinationButtonPerms.map(permission => permission.permId),
		requestedPermKeys: destinationButtonPerms.map(permission => permission.permKey),
		actorRole: actor.role,
		requestedRole: destinationRole
	});
}

export { canAssignRole, canDelegateRole, isConfiguredAdmin };
