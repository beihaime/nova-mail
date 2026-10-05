import BizError from '../error/biz-error';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import userService from './user-service';
import emailService from './email-service';
import orm from '../entity/orm';
import account from '../entity/account';
import { and, asc, eq, gt, inArray, count, sql, or, lt, desc } from 'drizzle-orm';
import {accountConst, isDel, settingConst} from '../const/entity-const';
import settingService from './setting-service';
import { hasConfiguredDomain } from '../utils/configured-domains';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import userContext from '../security/user-context';
import { t } from '../i18n/i18n';
import verifyRecordService from './verify-record-service';
import { pageNumber, pageSize } from '../utils/pagination';

const accountService = {

	async add(c, params, userId) {

		const { addEmailVerify , addEmail, manyEmail, addVerifyCount, minEmailPrefix, emailPrefixFilter } = await settingService.query(c);

		let { email, token } = params;
		email = emailUtils.normalizeEmail(email);


		if (!(addEmail === settingConst.addEmail.OPEN && manyEmail === settingConst.manyEmail.OPEN)) {
			throw new BizError(t('addAccountDisabled'));
		}


		if (!email) {
			throw new BizError(t('emptyEmail'));
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		if (!hasConfiguredDomain(c.env.domain, emailUtils.getDomain(email))) {
			throw new BizError(t('notExistDomain'));
		}

		if (emailUtils.getName(email).length < minEmailPrefix) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix } ));
		}

		if (emailPrefixFilter.some(content => emailUtils.getName(email).includes(content))) {
			throw new BizError(t('banEmailPrefix'));
		}

		let accountRow = await this.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelAccount'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		if (email.includes('+')) {
			const baseEmail = emailUtils.getBaseEmail(email);
			const baseAccount = await this.selectByEmailIncludeDel(c, baseEmail);
			if (!baseAccount || baseAccount.userId !== userId) {
				throw new BizError(t('notOwner'));
			}
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		if (!emailUtils.sameEmail(userRow.email, c.env.admin)) {

			if (roleRow.accountCount > 0) {
				const userAccountCount = await accountService.countUserAccount(c, userId)
				if(userAccountCount >= roleRow.accountCount) throw new BizError(t('accountLimit'), 403);
			}

			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) {
				throw new BizError(t('noDomainPermAdd'),403)
			}

		}

		let addVerifyOpen = false

		if (addEmailVerify === settingConst.addEmailVerify.OPEN) {
			addVerifyOpen = true
			await turnstileService.verify(c, token);
		}

		if (addEmailVerify === settingConst.addEmailVerify.COUNT) {
			addVerifyOpen = await verifyRecordService.isOpenAddVerify(c, addVerifyCount);
			if (addVerifyOpen) {
				await turnstileService.verify(c,token)
			}
		}


		accountRow = await orm(c).insert(account).values({ email: email, userId: userId, name: emailUtils.getName(email) }).returning().get();

		if (addEmailVerify === settingConst.addEmailVerify.COUNT && !addVerifyOpen) {
			const row = await verifyRecordService.increaseAddCount(c);
			addVerifyOpen = row.count >= addVerifyCount
		}

		accountRow.addVerifyOpen = addVerifyOpen
		return accountRow;
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(account).where(sql`${account.email} COLLATE NOCASE = ${emailUtils.normalizeEmail(email)}`).get();
	},

	list(c, params, userId) {

		let { accountId, size, lastSort } = params;

		accountId = Number(accountId);
		size = pageSize(size, 30, 30);
		lastSort = Number(lastSort);

		if (!accountId) {
			accountId = 0;
		}

		if(Number.isNaN(lastSort)) {
			lastSort = 9999999999;
		}

		return orm(c).select().from(account).where(
			and(
				eq(account.userId, userId),
				eq(account.isDel, isDel.NORMAL),
					or(
						lt(account.sort, lastSort),
						and(
							eq(account.sort, lastSort),
							gt(account.accountId, accountId)
						)
					))
				)
			.orderBy(desc(account.sort), asc(account.accountId))
			.limit(size)
			.all();
	},

	async delete(c, params, userId) {

		let { accountId } = params;

		const user = await userService.selectById(c, userId);
		// Ownership is part of the lookup: a foreign or unknown id is a 404 and
		// never reaches the mutation below, so no other user's row is touched.
		const accountRow = await this.requireOwnedAccount(c, accountId, userId);

		if (emailUtils.sameEmail(accountRow.email, user.email)) {
			throw new BizError(t('delMyAccount'));
		}

		const { syncDelete } = await settingService.query(c);
		if (syncDelete === settingConst.syncDelete.OPEN) {
			await this.physicsDelete(c, { accountId: accountRow.accountId });
			return;
		}

		await orm(c).update(account).set({ isDel: isDel.DELETE }).where(
			and(eq(account.userId, userId),
				eq(account.accountId, accountRow.accountId)))
			.run();
	},

	selectById(c, accountId) {
		return orm(c).select().from(account).where(
			and(eq(account.accountId, accountId),
				eq(account.isDel, isDel.NORMAL)))
			.get();
	},

	/**
	 * Owner-scoped address lookup. The authenticated user id is a required part
	 * of the WHERE clause, so a request can never read a row it does not own even
	 * if the caller supplies another account's numeric id.
	 */
	selectOwnedById(c, accountId, userId) {
		return orm(c).select().from(account).where(
			and(
				eq(account.accountId, accountId),
				eq(account.userId, userId),
				eq(account.isDel, isDel.NORMAL)))
			.get();
	},

	/**
	 * Resolve an address the caller is allowed to act on, or fail with the same
	 * 404 used for a non-existent id. This is the single authorization gate every
	 * address read and mutation goes through.
	 */
	async requireOwnedAccount(c, accountId, userId) {
		const accountRow = await this.selectOwnedById(c, accountId, userId);
		if (!accountRow) {
			throw new BizError(t('notFound'), 404);
		}
		return accountRow;
	},

	/**
	 * Administrator check for the cross-user address views. Mirrors the auth
	 * middleware: role id 0 or the deployment's configured administrator email.
	 * Frontend access to /admin is never treated as authorization.
	 */
	assertAdmin(c) {
		const user = userContext.getUser(c);
		const isAdmin = user && (user.type === 0 || emailUtils.sameEmail(user.email, c.env.admin));
		if (!isAdmin) {
			throw new BizError(t('unauthorized'), 403);
		}
	},

	async insert(c, params) {
		const { email, ...values } = params;
		await orm(c).insert(account).values({
			...values,
			email: emailUtils.normalizeEmail(email),
		}).returning();
	},

	async insertList(c, list) {
		await orm(c).insert(account).values(list.map(row => ({
			...row,
			email: emailUtils.normalizeEmail(row.email),
		}))).run();
	},

	async physicsDeleteByUserIds(c, userIds) {
		await emailService.physicsDeleteUserIds(c, userIds);
		await orm(c).delete(account).where(inArray(account.userId,userIds)).run();
	},

	async selectUserAccountCountList(c, userIds, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: account.userId,
				count: count(account.accountId)
			})
			.from(account)
			.where(and(
				inArray(account.userId, userIds),
				eq(account.isDel, del)
			))
			.groupBy(account.userId)
		return result;
	},

	async countUserAccount(c, userId) {
		const { num } = await orm(c).select({num: count()}).from(account).where(and(eq(account.userId, userId),eq(account.isDel, isDel.NORMAL))).get();
		return num;
	},

	async restoreByEmail(c, email) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(sql`${account.email} COLLATE NOCASE = ${emailUtils.normalizeEmail(email)}`).run();
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(eq(account.userId, userId)).run();
	},

	async setName(c, params, userId) {
		const { name, accountId } = params
		if (name.length > 30) {
			throw new BizError(t('usernameLengthLimit'));
		}
		await this.requireOwnedAccount(c, accountId, userId);
		await orm(c).update(account).set({name}).where(and(eq(account.userId, userId),eq(account.accountId, accountId))).run();
	},

	async allAccount(c, params) {

		// Defense in depth: the `/user` prefix is already administrator-gated by
		// the auth middleware, but this service is the last line before every
		// user's addresses are returned, so it re-checks the role itself.
		this.assertAdmin(c);

		let { userId, num, size } = params

		userId = Number(userId)

		num = pageNumber(num)
		size = pageSize(size, 30, 30)

		num = (num - 1) * size;

		const userRow = await userService.selectByIdIncludeDel(c, userId);

		if (!userRow) {
			throw new BizError(t('notFound'), 404);
		}

		const list = await orm(c).select().from(account).where(and(
			eq(account.userId, userId),
			sql`${account.email} COLLATE NOCASE != ${emailUtils.normalizeEmail(userRow.email)}`
		)).limit(size).offset(num);
		const { total } = await orm(c).select({ total: count() }).from(account).where(eq(account.userId, userId)).get();

		return { list, total }
	},

	async physicsDelete(c, params) {
		const { accountId } = params
		await emailService.physicsDeleteByAccountId(c, accountId)
		await orm(c).delete(account).where(eq(account.accountId, accountId)).run();
	},

	async setAllReceive(c, params, userId) {
		const { accountId } = params;
		const accountRow = await this.requireOwnedAccount(c, accountId, userId);
		await orm(c).update(account).set({ allReceive: accountConst.allReceive.CLOSE }).where(eq(account.userId, userId)).run();
		await orm(c).update(account).set({ allReceive: accountRow.allReceive ? 0 : 1 }).where(
			and(eq(account.accountId, accountId), eq(account.userId, userId))).run();
	},

	async setAsTop(c, params, userId) {
		const { accountId } = params;
		await this.requireOwnedAccount(c, accountId, userId);
		const userRow = await userService.selectById(c, userId);
		const mainAccountRow = await orm(c).select().from(account).where(
			and(
				sql`${account.email} COLLATE NOCASE = ${emailUtils.normalizeEmail(userRow.email)}`,
				eq(account.userId, userId)))
			.get();
		if (!mainAccountRow) {
			throw new BizError(t('notFound'), 404);
		}
		let mainSort = mainAccountRow.sort === 0 ? 2 : mainAccountRow.sort + 1;
		await orm(c).update(account).set({ sort: mainSort }).where(
			and(eq(account.userId, userId),
				sql`${account.email} COLLATE NOCASE = ${emailUtils.normalizeEmail(userRow.email)}`)).run();
		await orm(c).update(account).set({ sort: mainSort - 1 }).where(and(eq(account.accountId, accountId),eq(account.userId,userId))).run();
	}
};

export default accountService;
