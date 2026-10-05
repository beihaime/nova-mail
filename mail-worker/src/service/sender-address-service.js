import orm from '../entity/orm';
import account from '../entity/account';
import { and, asc, desc, eq } from 'drizzle-orm';
import { isDel } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import roleService from './role-service';
import userService from './user-service';
import userPreferencesService from './user-preferences-service';

/**
 * Default-sender resolution and send authorization.
 *
 * Nova Mail already stores every address a user owns as an `account` row and
 * keeps per-user preferences in `user_preferences`. The configured default
 * sender is therefore one nullable column on that existing table
 * (`default_sender_account_id`) — not a second address store — and this service
 * is the single owner of both the fallback chain and the "may this user send
 * from this address" rule:
 *
 *   configured default
 *       ↓  (only when it is still owned, active and send-capable)
 *   primary address (the account whose email equals the user's own address)
 *       ↓
 *   first active send-capable address the user owns
 *       ↓
 *   none
 *
 * Compose, reply, the Settings page and the send API all read this resolver, so
 * a stored reference that became invalid (deleted, disabled, ownership moved,
 * domain permission revoked) never produces an unauthorized sender.
 */
const senderAddressService = {

	/** A usable address row: it still exists and is not administratively disabled. */
	isActiveAccount(accountRow) {
		return Boolean(accountRow)
			&& accountRow.isDel !== isDel.DELETE
			&& Number(accountRow.status ?? 0) === 0;
	},

	/**
	 * Role rule for one address. Reuses `roleService.hasAvailDomainPerm`, the same
	 * predicate the send path has always used, so the Settings page can never
	 * offer an address the send API would refuse.
	 */
	canRoleSendFrom(c, roleRow, userRow, email) {
		if (emailUtils.sameEmail(c?.env?.admin, userRow?.email)) return true;
		if (!roleRow) return false;
		if (roleRow.sendType === 'ban') return false;
		return roleService.hasAvailDomainPerm(roleRow.availDomain, email);
	},

	/** True when the row is active and the supplied authorization context allows sending. */
	isSendable(c, accountRow, context = {}) {
		if (!this.isActiveAccount(accountRow)) return false;
		if (!context.roleRow) return false;
		return this.canRoleSendFrom(c, context.roleRow, context.userRow, accountRow.email);
	},

	/**
	 * Load the authorization context once per request. Callers that already hold
	 * the user and role rows (the send path) pass them in to avoid re-reading.
	 */
	async loadSendContext(c, userId, deps = {}) {
		const userRow = deps.userRow || await userService.selectById(c, userId);
		const roleRow = deps.roleRow || (userRow ? await roleService.selectById(c, userRow.type) : null);
		return { userRow, roleRow };
	},

	/**
	 * Every address the user owns, in the exact order the address list and the
	 * account switcher render (`sort` desc, then oldest first).
	 */
	listOwnedAccounts(c, userId) {
		return orm(c).select().from(account).where(
			and(eq(account.userId, userId), eq(account.isDel, isDel.NORMAL)))
			.orderBy(desc(account.sort), asc(account.accountId))
			.all();
	},

	/** An owned, non-deleted address by id, or null. Never returns another user's row. */
	selectOwnedAccountId(c, userId, accountId) {
		const id = Number(accountId);
		if (!Number.isInteger(id) || id <= 0) return Promise.resolve(null);
		return orm(c).select().from(account).where(
			and(
				eq(account.accountId, id),
				eq(account.userId, userId),
				eq(account.isDel, isDel.NORMAL)))
			.get();
	},

	/**
	 * The effective default sender: configured → primary → first send-capable → none.
	 * The stored preference is only trusted while it still resolves to a sendable
	 * address the caller owns, so an invalid reference degrades safely.
	 */
	async resolveEffectiveSender(c, userId, deps = {}) {
		if (userId == null) return null;
		const context = await this.loadSendContext(c, userId, deps);

		const configuredId = deps.configuredAccountId !== undefined
			? deps.configuredAccountId
			: await userPreferencesService.getDefaultSenderAccountId(c, userId);
		if (configuredId !== null) {
			const configured = await this.selectOwnedAccountId(c, userId, configuredId);
			if (this.isSendable(c, configured, context)) return configured;
		}

		const sendable = (await this.listOwnedAccounts(c, userId))
			.filter(row => this.isSendable(c, row, context));
		if (sendable.length === 0) return null;

		const primary = sendable.find(row => emailUtils.sameEmail(row.email, context.userRow?.email));
		return primary || sendable[0];
	},

	/** Annotate address-list rows with the server's own send-capability verdict. */
	async decorateSendability(c, userId, rows, deps = {}) {
		if (!Array.isArray(rows) || rows.length === 0) return rows;
		const context = await this.loadSendContext(c, userId, deps);
		return rows.map(row => ({ ...row, canSend: this.isSendable(c, row, context) }));
	},

	/**
	 * Send-time authorization. This is the only gate the outbound path trusts:
	 * the requested `accountId` must be an address the authenticated user owns,
	 * that is active, and that their role may send from. A client-supplied From
	 * identity is never accepted in its place (see `assertRequestedFrom`).
	 */
	async requireSendableSender(c, accountId, userId, deps = {}) {
		const id = Number(accountId);
		if (!Number.isInteger(id) || id <= 0) throw new BizError(t('senderAccountNotExist'));

		// Lookup deliberately ignores `is_del` so a deleted or disabled row keeps
		// the same two existing error messages instead of looking like a typo.
		const row = await orm(c).select().from(account).where(eq(account.accountId, id)).get();
		if (!row) throw new BizError(t('senderAccountNotExist'));
		if (row.userId !== userId) throw new BizError(t('sendEmailNotCurUser'));
		if (!this.isActiveAccount(row)) throw new BizError(t('senderAccountNotExist'), 403);

		const context = await this.loadSendContext(c, userId, deps);
		if (!this.canRoleSendFrom(c, context.roleRow, context.userRow, row.email)) {
			if (context.roleRow?.sendType === 'ban') throw new BizError(t('bannedSend'), 403);
			throw new BizError(t('noDomainPermSend'), 403);
		}
		return row;
	},

	/**
	 * Reject a request whose client-supplied From identity disagrees with the
	 * address the authenticated user actually selected. The composer always sends
	 * `sendEmail`; accepting it at face value is the spoofing hole this closes.
	 */
	assertRequestedFrom(params, accountRow) {
		for (const key of ['from', 'fromEmail', 'sendEmail']) {
			const value = params?.[key];
			if (typeof value !== 'string' || !value.trim()) continue;
			if (emailUtils.sameEmail(value, accountRow.email)) continue;
			throw new BizError(t('sendEmailNotCurUser'), 403);
		}
	},

	/**
	 * Persist the user's explicit choice after proving the address is theirs and
	 * usable. `null` clears the preference and lets the fallback chain decide.
	 *
	 * Errors follow the existing address-mutation conventions: an id the caller
	 * does not own (or that is gone) is the same 404 as every other address
	 * action, while an owned address that may not send is a 403.
	 */
	async setDefaultSender(c, accountId, userId) {
		if (accountId === null || accountId === undefined || Number(accountId) === 0) {
			await userPreferencesService.setDefaultSenderAccountId(c, userId, null);
			return {
				configuredAccountId: null,
				effectiveSender: await this.resolveEffectiveSender(c, userId),
			};
		}

		const owned = await this.selectOwnedAccountId(c, userId, accountId);
		if (!owned) throw new BizError(t('notFound'), 404);
		if (!this.isActiveAccount(owned)) throw new BizError(t('senderAccountDisabled'), 403);

		const context = await this.loadSendContext(c, userId);
		if (!this.canRoleSendFrom(c, context.roleRow, context.userRow, owned.email)) {
			if (context.roleRow?.sendType === 'ban') throw new BizError(t('bannedSend'), 403);
			throw new BizError(t('noDomainPermSend'), 403);
		}

		await userPreferencesService.setDefaultSenderAccountId(c, userId, owned.accountId);
		return { configuredAccountId: owned.accountId, effectiveSender: owned };
	},

	/** The stored preference, read before a mutation invalidates it. */
	getConfiguredAccountId(c, userId) {
		return userPreferencesService.getDefaultSenderAccountId(c, userId);
	},

	/**
	 * Keep the stored preference valid after an address disappears or becomes
	 * unusable. Called by the address data layer — not by the Settings button —
	 * so an administrator deletion or an ownership change repairs the reference
	 * the same way a user-initiated delete does.
	 *
	 * A user who never configured a default keeps `null` (the nullable preference
	 * plus runtime fallback is the compatibility path); only a dangling stored
	 * reference is rewritten to the fallback, or cleared when none exists.
	 */
	async reconcileDefaultSender(c, userId, deps = {}) {
		if (userId == null) return null;
		const configuredId = deps.configuredAccountId !== undefined
			? deps.configuredAccountId
			: await userPreferencesService.getDefaultSenderAccountId(c, userId);
		const resolved = await this.resolveEffectiveSender(c, userId, { ...deps, configuredAccountId: configuredId });
		const resolvedId = resolved?.accountId ?? null;

		if (configuredId !== null && configuredId !== resolvedId) {
			try {
				await userPreferencesService.setDefaultSenderAccountId(c, userId, resolvedId);
			} catch (error) {
				// Repair is best-effort: the resolver above already guarantees the
				// next read returns a valid, authorized sender either way.
				console.warn(`Default sender repair skipped: ${error.message}`);
			}
		}
		return resolved;
	},

	/** Clear every stored reference to addresses that are about to be removed. */
	async clearDefaultSenderForAccountIds(c, accountIds) {
		const ids = (accountIds || []).map(Number).filter(id => Number.isInteger(id) && id > 0);
		if (ids.length === 0) return;
		try {
			await c.env.db.prepare(
				`UPDATE user_preferences SET default_sender_account_id = NULL
				 WHERE default_sender_account_id IN (${ids.map(() => '?').join(', ')})`)
				.bind(...ids).run();
		} catch (e) {
			// A database that has not received the v3.24 column yet keeps working:
			// the resolver above never trusts an unowned or missing address.
			console.warn(`Default sender cleanup skipped: ${e.message}`);
		}
	},

	/** Same cleanup when every address of a set of users is being removed. */
	async clearDefaultSenderForUserIds(c, userIds) {
		const ids = (userIds || []).map(Number).filter(id => Number.isInteger(id) && id > 0);
		if (ids.length === 0) return;
		try {
			await c.env.db.prepare(
				`UPDATE user_preferences SET default_sender_account_id = NULL
				 WHERE user_id IN (${ids.map(() => '?').join(', ')})`)
				.bind(...ids).run();
		} catch (e) {
			console.warn(`Default sender cleanup skipped: ${e.message}`);
		}
	},
};

export default senderAddressService;
