import orm from '../entity/orm';
import email from '../entity/email';
import { emailListColumns, emailBriefColumns, EMAIL_LIST_TEXT_LEN } from '../lib/email-list-columns';
import { attConst, emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, notInArray, lt, count, asc, sql, ne, or, like, lte, gte } from 'drizzle-orm';
import { star } from '../entity/star';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import fileUtils from '../utils/file-utils';
import { Resend } from 'resend';
import attService from './att-service';
import { parseHTML } from 'linkedom';
import userService from './user-service';
import roleService from './role-service';
import user from '../entity/user';
import starService from './star-service';
import dayjs from 'dayjs';
import kvConst from '../const/kv-const';
import { t } from '../i18n/i18n'
import domainUtils from '../utils/domain-uitls';
import account from "../entity/account";
import { att } from '../entity/att';
import telegramService from './telegram-service';
import { safeMessageId, validateOutgoingMail } from '../utils/outgoing-mail-validation';
import { MAIL_LIMITS, assertAttachmentLimits } from '../const/mail-limits';
import { MAIL_BODY } from '../lib/mail-body';
import threadService from './thread-service';
import senderAvatarService from './sender-avatar-service';
import pushService from './push-service';
import { pageSize } from '../utils/pagination';
import sendLifecycle from './send-lifecycle';

const MAX_SEARCH_LENGTH = 200;

function normalizeSearchKeyword(value) {
	return String(value || '').trim().slice(0, MAX_SEARCH_LENGTH);
}

/**
 * Normalise an `emailIds` argument to positive integers.
 *
 * The delete route takes a comma-separated query string while the read/archive
 * routes take a JSON array, so both shapes are accepted here. Anything that is
 * not a positive integer is dropped rather than reaching SQL as `NaN`, which
 * would silently match nothing.
 */
function toEmailIdList(emailIds) {
	const raw = Array.isArray(emailIds) ? emailIds : String(emailIds ?? '').split(',');

	return raw
		.map(value => Number(value))
		.filter(value => Number.isInteger(value) && value > 0);
}

/**
 * Expand selected messages into complete conversations owned by one mailbox.
 *
 * The Inbox renders one (newest) message per thread, so deleting only that
 * representative leaves its older siblings alive. A later message with the
 * same subject can then attach to those siblings and make an apparently
 * deleted conversation reappear. Empty legacy thread ids deliberately resolve
 * to their own message only: treating every empty value as one conversation
 * would delete unrelated old mail.
 */
async function ownedThreadMessageIds(c, userId, emailIds) {
	const selectedIds = toEmailIdList(emailIds);
	if (!selectedIds.length) return [];

	const anchors = await orm(c)
		.select({ emailId: email.emailId, threadId: email.threadId, accountId: email.accountId })
		.from(email)
		.where(and(
			eq(email.userId, userId),
			inArray(email.emailId, selectedIds),
		))
		.all();

	if (!anchors.length) return [];

	const conversationFilters = anchors.map(anchor => and(
		eq(email.accountId, anchor.accountId),
		anchor.threadId
			? eq(email.threadId, anchor.threadId)
			: eq(email.emailId, anchor.emailId)
	));

	const rows = await orm(c)
		.select({ emailId: email.emailId })
		.from(email)
		.where(and(
			eq(email.userId, userId),
			or(...conversationFilters),
		))
		.all();

	return rows.map(row => row.emailId);
}

function emailKeywordFilters(keyword) {
	if (!keyword) return [];

	// Escape LIKE metacharacters so a user-entered '%' or '_' remains a literal
	// search term. The value is still bound through Drizzle's SQL parameters.
	const escaped = keyword.replace(/[\\%_]/g, '\\$&');
	const pattern = `%${escaped}%`;
	const like = (column) => sql`lower(coalesce(${column}, '')) LIKE lower(${pattern}) ESCAPE '\\'`;

	return [or(
		like(email.name),
		like(email.sendEmail),
		like(email.subject),
		like(email.text),
		like(email.content),
		like(email.toEmail),
		like(email.recipient)
	)];
}

const emailService = {

	async list(c, params, userId) {

		let { emailId, type, accountId, size, timeSort, allReceive, full, keyword, archived, trashed } = params;

		size = pageSize(size);
		// Trash contains both received and sent copies.  Normal folders still send
		// their concrete numeric type; the owner-only Trash view is the one caller
		// allowed to request all types.
		const allTypes = String(type || '').toLowerCase() === 'all';
		type = allTypes ? null : Number(type);
		emailId = Number(emailId) || 0;
		timeSort = Number(timeSort);
		accountId = Number(accountId);
		allReceive = Number(allReceive);
		full = Number(full);
		keyword = normalizeSearchKeyword(keyword);
		// The Archive view asks for `archived=1`; every other list keeps the
		// default and never sees archived mail.
		trashed = Number(trashed) === 1 ? 1 : 0;
		// Archive is the previous folder state once a row is in Trash, not a
		// second Trash sub-folder.  Show both archived and inbox rows there.
		archived = trashed ? null : (Number(archived) === 1 ? 1 : 0);

		if (!allTypes && isNaN(type)) {
			type = 0;
		}

		if (isNaN(accountId)) {
			throw new BizError(t('emptyAccountId'));
		}


		if (isNaN(full)) {
			full = 1;
		}

		full = full === 1;

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		const filters = this.emailListFilters({ userId, accountId, type, allReceive, emailId, timeSort, keyword, archived, trashed });
		const countFilters = this.emailListFilters({ userId, accountId, type, allReceive, withCursor: false, keyword, archived, trashed });
		const columns = full ? emailListColumns : emailBriefColumns;

		// The Inbox (received mail) is a conversation list: rows are collapsed to
		// the newest message of each thread so a reply updates and re-orders its
		// conversation instead of appearing as a second Inbox item. Sent and the
		// other folders stay message-per-row.
		const groupByThread = type === emailConst.type.RECEIVE || trashed === 1;

		// Conversation key. Legacy rows without a thread id stay separate
		// (`e:<email_id>`) instead of collapsing into one bucket.
		const threadKey = sql`coalesce(nullif(${email.threadId}, ''), 'e:' || ${email.emailId})`;
		const newestMessageId = sql`max(${email.emailId})`;

		let list;
		let totalRow;

		if (groupByThread) {
			// 1) Pick the representative (newest) message of every conversation.
			const representativeQuery = orm(c)
				.select({ emailId: sql`${newestMessageId}`.as('emailId') })
				.from(email)
				.innerJoin(
					account,
					eq(account.accountId, email.accountId)
				)
				.where(and(...filters))
				.groupBy(threadKey);

			if (emailId) {
				representativeQuery.having(
					timeSort ? sql`${newestMessageId} > ${emailId}` : sql`${newestMessageId} < ${emailId}`
				);
			}

			representativeQuery
				.orderBy(timeSort ? sql`${newestMessageId} asc` : sql`${newestMessageId} desc`)
				.limit(size);

			const representatives = await representativeQuery.all();
			const representativeIds = representatives.map(row => row.emailId);

			if (representativeIds.length) {
				// 2) Hydrate them with the requested column set.
				const rows = await orm(c)
					.select({
						...columns,
						starId: star.starId
					})
					.from(email)
					.leftJoin(
						star,
						and(
							eq(star.emailId, email.emailId),
							eq(star.userId, userId)
						)
					)
					.innerJoin(
						account,
						eq(account.accountId, email.accountId)
					)
					.where(inArray(email.emailId, representativeIds))
					.all();

				// `IN (…)` does not preserve order, so re-apply the thread order.
				const order = new Map(representativeIds.map((id, index) => [id, index]));
				rows.sort((a, b) => order.get(a.emailId) - order.get(b.emailId));
				list = rows;
			} else {
				list = [];
			}

			totalRow = await orm(c)
				.select({ total: sql`count(distinct ${threadKey})` })
				.from(email)
				.innerJoin(
					account,
					eq(account.accountId, email.accountId)
				)
				.where(and(...countFilters))
				.get();
		} else {
			const query = orm(c)
				.select({
					...columns,
					starId: star.starId
				})
				.from(email)
				.leftJoin(
					star,
					and(
						eq(star.emailId, email.emailId),
						eq(star.userId, userId)
					)
				)
				.innerJoin(
					account,
					eq(account.accountId, email.accountId)
				)
				.where(and(...filters));

			if (timeSort) {
				query.orderBy(asc(email.emailId));
			} else {
				query.orderBy(desc(email.emailId));
			}

			list = await query.limit(size).all();

			totalRow = await orm(c).select({ total: count() }).from(email)
				.innerJoin(
					account,
					eq(account.accountId, email.accountId)
				)
				.where(and(...countFilters))
				.get();
		}

		const latestEmailQuery = orm(c).select({
			emailId: email.emailId,
			accountId: email.accountId,
			trashed: email.trashed,
			userId: email.userId,
		}).from(email).where(
			and(
				eq(email.userId, userId),
				type === null ? undefined : eq(email.type, type),
				eq(email.isDel, isDel.NORMAL),
				// Match the view being listed: the Inbox's poll cursor must skip
				// archived mail, and the Archive view must not be seeded with an
				// Inbox id it would then page against.
				archived === null ? undefined : eq(email.archived, archived),
				eq(email.trashed, trashed),
				allReceive ? undefined : eq(email.accountId, accountId),
				...emailKeywordFilters(keyword)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let latestEmail = await latestEmailQuery;

		list = list.map(item => ({
			...item,
			isStar: item.starId != null ? 1 : 0
		}));

		if (full) {
			await this.emailAddAtt(c, list);
		} else {
			this.applyListText(list);
		}

		// Sender avatars ride along with every list row (cheap local + cache path;
		// unresolved rows are marked `pending` and finished by GET /avatar).
		await senderAvatarService.attach(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: accountId,
				userId: userId,
			}
		}

		return { list, total: totalRow.total, latestEmail };
	},

	/**
	 * Every message of one conversation, oldest → newest.
	 *
	 * The Inbox only carries the newest message of a thread, so the reader calls
	 * this to rebuild the whole conversation: the original, every received
	 * reply and the user's own replies.
	 */
	async thread(c, params, userId) {
		const emailId = Number(params.emailId) || 0;
		let threadId = String(params.threadId || '').trim();

		// Legacy rows may still be missing a thread id; fall back to resolving it
		// from the anchor message, then to the single-message key.
		const legacyThreadKey = sql`coalesce(nullif(${email.threadId}, ''), 'e:' || ${email.emailId})`;

		if (!threadId && emailId) {
			const anchor = await orm(c)
				.select({
					emailId: email.emailId,
					threadId: email.threadId,
					messageId: email.messageId,
					inReplyTo: email.inReplyTo,
					relation: email.relation,
					subject: email.subject,
					userId: email.userId,
					accountId: email.accountId,
					trashed: email.trashed,
				})
				.from(email)
				.where(and(eq(email.emailId, emailId), eq(email.userId, userId)))
				.get();

			if (!anchor) {
				throw new BizError(t('notExistEmailReply'));
			}
			params.trashed = anchor.trashed;

			if (anchor.threadId) {
				threadId = anchor.threadId;
			} else {
				const resolved = await threadService.resolveThreadForMessage(c, anchor);
				threadId = resolved.threadId || `e:${anchor.emailId}`;
			}
		}

		if (!threadId) {
			return { threadId: '', subject: '', messages: [] };
		}

		const messages = await orm(c)
			.select({ ...emailListColumns })
			.from(email)
			.innerJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(and(
				eq(email.userId, userId),
				eq(legacyThreadKey, threadId),
				eq(email.isDel, isDel.NORMAL),
				eq(email.trashed, Number(params.trashed) === 1 ? 1 : 0),
				eq(account.isDel, isDel.NORMAL),
			))
			.orderBy(asc(email.emailId))
			.all();

		await this.emailAddAtt(c, messages);
		await senderAvatarService.attach(c, messages);

		return {
			threadId,
			subject: messages[0]?.subject || '',
			messages,
		};
	},

	toListText(item) {
		return emailUtils.toPreviewText(item.text, item.content, item.bodyType).slice(0, EMAIL_LIST_TEXT_LEN);
	},

	applyListText(list) {
		for (const item of list) {
			item.listText = this.toListText(item);
			delete item.text;
			delete item.content;
		}
		return list;
	},

	emailListFilters({ userId, accountId, type, allReceive, emailId, timeSort, keyword, archived = 0, trashed = 0, withCursor = true }) {
		const conditions = [
			eq(email.userId, userId),
			type === null ? undefined : eq(email.type, type),
			eq(email.isDel, isDel.NORMAL),
			// One flag, two views: the Inbox asks for `archived = 0` and the
			// Archive view for `archived = 1`, so neither can leak into the other.
			archived === null ? undefined : eq(email.archived, archived),
			eq(email.trashed, trashed),
			eq(account.isDel, isDel.NORMAL),
		];
		if (!allReceive) {
			conditions.push(eq(email.accountId, accountId));
		}
		if (withCursor && emailId) {
			conditions.push(timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId));
		}
		conditions.push(...emailKeywordFilters(keyword));
		return conditions;
	},

	allEmailListFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort, withCursor = true }) {
		// Administrative All Mail follows normal client semantics: Trash is only
		// visible through the owner-scoped Trash mailbox, never this global view.
		const conditions = [eq(email.trashed, 0)];

		if (type === 'send') {
			conditions.push(eq(email.type, emailConst.type.SEND));
		}

		if (type === 'receive') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE));
		}

		if (type === 'delete') {
			conditions.push(eq(email.isDel, isDel.DELETE));
		}

		if (type === 'noone') {
			conditions.push(eq(email.status, emailConst.status.NOONE));
		}

		if (userEmail) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${userEmail + '%'}`);
		}

		if (accountEmail) {
			conditions.push(
				or(
					sql`${email.toEmail} COLLATE NOCASE LIKE ${accountEmail + '%'}`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${accountEmail + '%'}`,
				)
			);
		}

		if (name) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${name + '%'}`);
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject + '%'}`);
		}

		if (withCursor && emailId) {
			conditions.push(timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId));
		}

		return conditions;
	},

	async moveToTrash(c, params, userId) {
		const emailIdList = await ownedThreadMessageIds(c, userId, params?.emailIds);
		if (!emailIdList.length) return { soft: true };

		// Preserve the actual folder state before hiding the message. Attachments
		// and delivery metadata remain untouched; moving to Trash clears stars.
		await orm(c).update(email).set({
			trashed: 1,
			trashedAt: new Date().toISOString(),
			trashArchived: sql`${email.archived}`,
		}).where(
			and(
				eq(email.userId, userId),
				eq(email.trashed, 0),
				inArray(email.emailId, emailIdList)))
			.run();
		await starService.removeByEmailIds(c, emailIdList);

		return { soft: true };
	},

	/**
	 * Administrative All Mail uses the same non-destructive mailbox action.
	 * Its route is protected by `all-email:delete`; unlike the user route it may
	 * act on a row owned by another mailbox, so only the selected records (not
	 * a cross-user thread expansion) are moved.  The owner can restore it from
	 * their own Trash afterwards.
	 */
	async moveToTrashAdmin(c, params) {
		const emailIdList = toEmailIdList(params?.emailIds);
		if (!emailIdList.length) return { soft: true };
		await orm(c).update(email).set({
			trashed: 1,
			trashedAt: new Date().toISOString(),
			trashArchived: sql`${email.archived}`,
		}).where(and(eq(email.trashed, 0), inArray(email.emailId, emailIdList))).run();
		await starService.removeByEmailIds(c, emailIdList);
		return { soft: true };
	},

	// Compatibility alias for internal callers retained during the Trash rollout.
	async delete(c, params, userId) { return this.moveToTrash(c, params, userId); },

	/**
	 * Take messages out of the Inbox without deleting them (mobile swipe right).
	 *
	 * Only the caller's own, not-yet-deleted rows are touched. Archiving is
	 * reversible at any time through `unarchive`/`restore`.
	 */
	async archive(c, params, userId) {
		return this.setArchived(c, params, userId, 1);
	},

	async unarchive(c, params, userId) {
		return this.setArchived(c, params, userId, 0);
	},

	async setArchived(c, params, userId, archived) {
		const emailIdList = toEmailIdList(params?.emailIds);
		if (!emailIdList.length) return;

		await orm(c).update(email).set({ archived }).where(
			and(
				eq(email.userId, userId),
				eq(email.isDel, isDel.NORMAL),
				eq(email.trashed, 0),
				inArray(email.emailId, emailIdList)))
			.run();
		if (archived) await starService.removeByEmailIds(c, emailIdList);
	},

	/**
	 * Bring soft-deleted messages back (the swipe delete's "Undo").
	 *
	 * A row that was physically deleted does not exist any more, so this matches
	 * nothing and is a no-op — the client only offers Undo when `delete` reported
	 * `soft: true`.
	 */
	async restoreFromTrash(c, params, userId) {
		const emailIdList = await ownedThreadMessageIds(c, userId, params?.emailIds);
		if (!emailIdList.length) return;

		await orm(c).update(email).set({
			trashed: 0,
			trashedAt: '',
			archived: sql`${email.trashArchived}`,
			trashArchived: 0,
		}).where(
			and(
				eq(email.userId, userId),
				eq(email.trashed, 1),
				inArray(email.emailId, emailIdList)))
			.run();
		// Restoring a message never restores its former star state. This also
		// cleans up records created before archive/trash actions cleared stars.
		await starService.removeByEmailIds(c, emailIdList);
	},

	async restore(c, params, userId) { return this.restoreFromTrash(c, params, userId); },

	async deleteForever(c, params, userId) {
		const emailIdList = await ownedThreadMessageIds(c, userId, params?.emailIds);
		if (!emailIdList.length) return;
		await this.deleteTrashedRows(c, userId, emailIdList);
	},

	async emptyTrash(c, params, userId) {
		const accountId = Number(params?.accountId);
		// Emptying Trash is intentionally scoped to the active, owned account.
		// Never treat a missing or malformed account id as "all accounts".
		if (!Number.isInteger(accountId) || accountId <= 0) {
			throw new BizError(t('emptyAccountId'));
		}
		const conditions = [
			eq(email.userId, userId),
			eq(email.accountId, accountId),
			eq(email.trashed, 1)
		];
		const rows = await orm(c).select({ emailId: email.emailId }).from(email).where(and(...conditions)).all();
		if (rows.length) await this.deleteTrashedRows(c, userId, rows.map(row => row.emailId), accountId);
	},

	async deleteTrashedRows(c, userId, emailIds, accountId = null) {
		if (!emailIds.length) return;
		const db = c.env.db;
		const placeholders = emailIds.map(() => '?').join(',');
		const scope = `user_id = ? AND trashed = 1 AND email_id IN (${placeholders})
			AND account_id IN (SELECT account_id FROM account WHERE user_id = ?)${accountId ? ' AND account_id = ?' : ''}`;
		const binds = [userId, ...emailIds, userId, ...(accountId ? [accountId] : [])];
		const candidates = await db.prepare(`SELECT a.email_id, a.key FROM attachments a WHERE a.email_id IN
			(SELECT email_id FROM email WHERE ${scope})`).bind(...binds).all();
		await c.testHooks?.beforeConditionalTrashDelete?.();
		// D1 batch is one transaction. Restore and this conditional deletion
		// serialize; only rows still in Trash can lose attachments or stars.
		const results = await db.batch([
			db.prepare(`DELETE FROM attachments WHERE email_id IN (SELECT email_id FROM email WHERE ${scope})`).bind(...binds),
			db.prepare(`DELETE FROM star WHERE email_id IN (SELECT email_id FROM email WHERE ${scope})`).bind(...binds),
			db.prepare(`DELETE FROM email WHERE ${scope} RETURNING email_id`).bind(...binds),
		]);
		const deleted = new Set((results[2]?.results || []).map(row => row.email_id));
		const keys = [...new Set((candidates.results || []).filter(row => deleted.has(row.email_id)).map(row => row.key))];
		const orphaned = [];
		for (const key of keys) {
			const remaining = await db.prepare('SELECT 1 FROM attachments WHERE key = ? LIMIT 1').bind(key).first();
			if (!remaining) orphaned.push(key);
		}
		if (orphaned.length) {
			try { await attService.batchDelete(c, orphaned); }
			catch (error) { console.error('删除附件文件失败：', error); }
		}
	},

	/**
	 * Persist an incoming message.
	 *
	 * Two things happen before the insert:
	 *  - Message-ID dedupe: a Cloudflare / webhook retry of the same message
	 *    must not create a second row.
	 *  - Thread resolution: the message joins the conversation of its parent
	 *    (In-Reply-To → References → subject fallback), otherwise it starts one.
	 *
	 * If the v3.6 migration has not run yet (the Worker is deployed a few
	 * seconds before a schema upgrade adds the columns), the mail is still stored —
	 * just without a conversation key — so nothing is rejected or lost.
	 */
	async receive(c, params, cidAttList, r2domain) {
		params = {
			...params,
			sendEmail: emailUtils.normalizeEmail(params.sendEmail),
			toEmail: emailUtils.normalizeEmail(params.toEmail),
		};
		let thread = { threadId: '', parentMessageId: 0 };
		let supportsThreads = true;

		try {
			const existing = await threadService.findExistingMessage(c, params);
			if (existing) {
				return { ...existing, deduplicated: true };
			}

			thread = await threadService.resolveThreadForMessage(c, params);
		} catch (error) {
			if (!threadService.isMissingThreadColumn(error)) {
				throw error;
			}
			supportsThreads = false;
		}

		if (supportsThreads) {
			params.threadId = thread.threadId || threadService.newThreadId();
			params.parentMessageId = thread.parentMessageId || 0;
		}

		params.content = this.imgReplace(params.content, cidAttList, r2domain);

		try {
			return await orm(c).insert(email).values({ ...params }).returning().get();
		} catch (error) {
			// The lookup above closes the normal retry path. This second lookup
			// closes the concurrent-delivery gap protected by the mailbox-scoped
			// unique index, without treating an unrelated database failure as mail.
			const existing = await threadService.findExistingMessage(c, params);
			if (existing) return { ...existing, deduplicated: true };
			throw error;
		}
	},

	//邮件发送
	async send(c, params, userId) {
		params = validateOutgoingMail(params);

		let {
			accountId, //发送账号id
			name, //发件人名字
			sendType, //发件类型
			emailId, //邮件id，如果是回复邮件会带
			receiveEmail, //收件人邮箱
			cc = [], //抄送
			bcc = [], //密送
			text, //邮件纯文本
			content, //邮件内容
			subject, //邮件标题
			attachments = [] //附件
		} = params;
		receiveEmail = receiveEmail.map(emailUtils.normalizeEmail);
		cc = cc.map(emailUtils.normalizeEmail);
		bcc = bcc.map(emailUtils.normalizeEmail);

		const { resendTokens, r2Domain, send, domainList } = await settingService.query(c);
		const allRecipients = [...receiveEmail, ...cc, ...bcc];

		//判断是否关闭发件功能
		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		//判断接收方是不是全部为站内邮箱
		const allInternal = allRecipients.every(email => {
			const domain = '@' + emailUtils.getDomain(email);
			return domainList.includes(domain);
		});

		if (!emailUtils.sameEmail(c.env.admin, userRow.email)) {

			//发件被禁用
			if (roleRow.sendType === 'ban') {
				throw new BizError(t('bannedSend'), 403);
			}

			//发件被禁用
			if (roleRow.sendType === 'internal' && !allInternal) {
				throw new BizError(t('onlyInternalSend'), 403);
			}

		}

		const accountRow = await accountService.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== userId) {
			throw new BizError(t('sendEmailNotCurUser'));
		}

		if (!emailUtils.sameEmail(c.env.admin, userRow.email)) {
			//用户没有这个域名的使用权限
			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		const domain = emailUtils.getDomain(accountRow.email);
		const resendToken = resendTokens[domain];
		const useCloudflareEmail = !!c.env.email;

		//如果接收方存在站外邮箱，又没有发信服务
		if (!useCloudflareEmail && !resendToken && !allInternal) {
			throw new BizError(t('noSendProvider'));
		}
		// Only resolve user-supplied object keys after sender ownership and send permission checks.
		const idempotencyKey = params.idempotencyKey || crypto.randomUUID();
		let { imageDataList, html } = await attService.toImageUrlHtml(c, content, userId, `${userId}:${idempotencyKey}`);
		if (imageDataList.length + attachments.length > MAIL_LIMITS.MAX_ATTACHMENT_COUNT) {
			throw new BizError(t('attLimit'));
		}
		assertAttachmentLimits([...imageDataList, ...attachments]);

		//没有发件人名字自动截取
		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		let emailRow = {
			messageId: null
		};

		//如果是回复邮件
		if (sendType === 'reply') {

			emailRow = await this.selectById(c, emailId, userId);

			if (!emailRow) {
				throw new BizError(t('notExistEmailReply'));
			}

		}

		const quotaCost = roleRow.sendCount && roleRow.sendType !== 'internal' ? allRecipients.length : 0;
		const quotaLimit = !emailUtils.sameEmail(c.env.admin, userRow.email) && roleRow.sendCount
			? Number(roleRow.sendCount) : null;
		const operation = await sendLifecycle.reserve(c, {
			userId, key: idempotencyKey, params: { ...params, idempotencyKey: undefined },
			cost: quotaCost, limit: quotaLimit,
		});
		if (operation.status === 'finalized') {
			const result = await orm(c).select().from(email).where(eq(email.emailId, operation.email_id)).get();
			if (!result) throw new BizError('Finalized send record is missing', 502);
			result.attList = await attService.selectByEmailIds(c, [result.emailId]);
			return [result];
		}
		if (operation.status === 'failed') throw new BizError('The previous send failed before delivery; retry with a new key', 409);
		if (operation.status === 'dispatching') throw new BizError('Send delivery is pending reconciliation', 409);

		let sendResult = { data: { id: operation.provider_id } };

		//存在站外邮箱时，如果配置了 Cloudflare Email Service 就优先使用，否则使用 Resend
		if (operation.status === 'reserved') {
			if (!await sendLifecycle.claimDispatch(c, operation.operation_id)) {
				throw new BizError('Send is already in progress', 409);
			}
			let providerAccepted = false;
			try {
			if (!allInternal) {

			if (useCloudflareEmail) {
				sendResult = await this.sendByCloudflareEmail(c, {
					name,
					accountEmail: accountRow.email,
					receiveEmail,
					cc,
					bcc,
					subject,
					text,
					html,
					attachments: [...imageDataList, ...attachments],
					sendType,
					messageId: emailRow.messageId,
					idempotencyKey: operation.operation_id
				});
			} else {
				sendResult = await this.sendByResend(resendToken, {
					name,
					accountEmail: accountRow.email,
					receiveEmail,
					cc,
					bcc,
					subject,
					text,
					html,
					attachments: [...imageDataList, ...attachments],
					sendType,
					messageId: emailRow.messageId,
					idempotencyKey: operation.operation_id
				});
			}

			}
			if (sendResult.error) {
				await sendLifecycle.failedBeforeAcceptance(c, operation.operation_id);
				throw new BizError(sendResult.error.message);
			}
			providerAccepted = true;
			// A failed acceptance write leaves dispatching (uncertain) and must not
			// trigger a second provider call on retry.
			await sendLifecycle.accepted(c, operation.operation_id, sendResult.data?.id);
			} catch (error) {
				// Only failures before the acceptance write release the reservation.
				// If D1 cannot record provider acceptance, keep dispatching: retrying
				// that key must reconcile manually instead of delivering twice.
				const current = await c.env.db.prepare('SELECT status FROM outbound_send WHERE operation_id = ?').bind(operation.operation_id).first();
				if (!providerAccepted && current?.status === 'dispatching') await sendLifecycle.failedBeforeAcceptance(c, operation.operation_id);
				throw error;
			}
		}

		const { data, error } = sendResult;


		if (error) {
			throw new BizError(error.message);
		}
		if (!await sendLifecycle.claimFinalize(c, operation.operation_id)) {
			throw new BizError('Send finalization is already in progress', 409);
		}
		try {
		await c.testHooks?.beforeSendFinalization?.();

		imageDataList = imageDataList.map(item => ({...item, contentId: `<${item.contentId}>`}))

		//把图片标签cid标签切换会通用url
		html = this.imgReplace(html, imageDataList, r2Domain);

		//封装数据保存到数据库
		const emailData = {};
		emailData.sendEmail = accountRow.email;
		emailData.name = name;
		emailData.subject = subject;
		emailData.content = html;
		emailData.text = text;
		// Outbound mail written in the composer is HTML; a text-only body is
		// stored as plain so the reader escapes it instead of rendering markup.
		emailData.bodyType = html && html.trim() ? MAIL_BODY.HTML : MAIL_BODY.PLAIN;
		emailData.accountId = accountId;
		emailData.status = useCloudflareEmail ? emailConst.status.DELIVERED : emailConst.status.SENT;
		emailData.type = emailConst.type.SEND;
		emailData.userId = userId;
		emailData.resendEmailId = data?.id;
		emailData.sendOperationId = operation.operation_id;

		const recipient = [];

		receiveEmail.forEach(item => {
			recipient.push({ address: item, name: '' });
		});

		emailData.recipient = JSON.stringify(recipient);
		emailData.cc = JSON.stringify(cc.map(address => ({ address, name: '' })));
		emailData.bcc = JSON.stringify(bcc.map(address => ({ address, name: '' })));

		// Every message belongs to a conversation. This is assigned here too — a
		// mail the user starts is the root of a new thread, and without a key the
		// reply that eventually arrives (whose In-Reply-To we cannot match, since
		// outbound Message-IDs are provider generated) would open a second one.
		const threadHeaders = {
			userId,
			subject,
			sendEmail: accountRow.email,
			toEmail: receiveEmail[0] || '',
			recipient,
		};

		if (sendType === 'reply') {
			emailData.inReplyTo = emailRow.messageId;
			emailData.relation = emailRow.messageId;

			// Keep the reply inside the conversation it answers so the reader can
			// reload the whole thread (and the Inbox never splits it). A reply
			// sent before the v3.6 migration runs simply has no thread key.
			try {
				const thread = await threadService.resolveThreadForMessage(c, {
					...threadHeaders,
					messageId: '',
					inReplyTo: emailRow.messageId,
					references: emailRow.messageId,
					threadId: emailRow.threadId,
					parentMessageId: emailRow.emailId
				});
				emailData.threadId = thread.threadId || emailRow.threadId || threadService.newThreadId();
				emailData.parentMessageId = thread.parentMessageId || Number(emailRow.emailId) || 0;
			} catch (error) {
				if (!threadService.isMissingThreadColumn(error)) throw error;
			}
		} else {
			// New outbound mail: start its own conversation, unless it is a
			// continuation the headers/subject can already place.
			try {
				const thread = await threadService.resolveThreadForMessage(c, {
					...threadHeaders,
					messageId: '',
				});
				emailData.threadId = thread.threadId || threadService.newThreadId();
				emailData.parentMessageId = thread.parentMessageId || 0;
			} catch (error) {
				if (!threadService.isMissingThreadColumn(error)) throw error;
			}
		}

		//保存到数据库并返回结果
		let emailResult = await orm(c).insert(email).values(emailData).onConflictDoNothing().returning().get();
		if (!emailResult) emailResult = await orm(c).select().from(email)
			.where(and(eq(email.sendOperationId, operation.operation_id), eq(email.type, emailConst.type.SEND))).get();
		if (!emailResult) throw new BizError('Sent-mail record could not be recovered', 502);

		//保存内嵌附件
		if (imageDataList.length > 0) {
			await attService.saveArticleAtt(c, imageDataList, userId, accountId, emailResult.emailId, operation.operation_id);
		}

		//保存普通附件
		if (attachments?.length > 0) {
			await attService.saveSendAtt(c, attachments, userId, accountId, emailResult.emailId, operation.operation_id);
		}

		const attList = await attService.selectByEmailIds(c, [emailResult.emailId]);
		emailResult.attList = attList;

		//如果全是站内接收方，直接写入数据库
		if (allInternal) {
			await this.HandleOnSiteEmail(c, allRecipients, emailResult, attList);
		}

		await senderAvatarService.attach(c, [emailResult]);

		const dateStr = dayjs().format('YYYY-MM-DD');
		let daySendTotal = await c.env.kv.get(kvConst.SEND_DAY_COUNT + dateStr);

		//记录每天发件次数统计
		if (!daySendTotal) {
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(allRecipients.length), { expirationTtl: 60 * 60 * 24 });
		} else  {
			daySendTotal = Number(daySendTotal) + allRecipients.length
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(daySendTotal), { expirationTtl: 60 * 60 * 24 });
		}

		await sendLifecycle.finalized(c, operation.operation_id, emailResult.emailId);
		return [ emailResult ];
		} catch (error) {
			try { await sendLifecycle.retryFinalize(c, operation.operation_id); }
			catch (recoveryError) { console.error('Send finalization state recovery failed', recoveryError); }
			throw error;
		}
	},

	async sendByCloudflareEmail(c, params) {
		const sendForm = {
			from: { email: params.accountEmail, name: params.name },
			to: [...params.receiveEmail],
			subject: params.subject
		};

		if (params.cc?.length) sendForm.cc = [...params.cc];
		if (params.bcc?.length) sendForm.bcc = [...params.bcc];

		if (params.text) {
			sendForm.text = params.text;
		}

		if (params.html) {
			sendForm.html = params.html;
		}

		const attachments = await this.toCloudflareAttachments(params.attachments);
		if (attachments.length > 0) {
			sendForm.attachments = attachments;
		}

		const messageId = safeMessageId(params.messageId);
		if (params.sendType === 'reply' && messageId) {
			sendForm.headers = {
				'in-reply-to': messageId,
				'references': messageId
			};
		}

		const result = await c.env.email.send(sendForm);

		return {
			data: {
				id: result.messageId
			}
		};
	},

	async sendByResend(resendToken, params) {
		const resend = new Resend(resendToken);

		const sendForm = {
			from: `"${params.name.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}" <${params.accountEmail}>`,
			to: [...params.receiveEmail],
			subject: params.subject,
			text: params.text,
			html: params.html,
			attachments: await this.toResendAttachments(params.attachments)
		};

		if (params.cc?.length) sendForm.cc = [...params.cc];
		if (params.bcc?.length) sendForm.bcc = [...params.bcc];

		const messageId = safeMessageId(params.messageId);
		if (params.sendType === 'reply' && messageId) {
			sendForm.headers = {
				'in-reply-to': messageId,
				'references': messageId
			};
		}

		return await resend.emails.send(sendForm, { idempotencyKey: params.idempotencyKey });
	},

	async toCloudflareAttachments(attachments) {
		const arrayBufferAttachments = await this.toArrayBufferAttachments(attachments);

		return arrayBufferAttachments.map(attachment => {
			const item = {
				content: attachment.content,
				filename: attachment.filename,
				type: attachment.mimeType || attachment.contentType || attachment.type || 'application/octet-stream',
				disposition: attachment.contentId ? 'inline' : 'attachment'
			};

			if (attachment.contentId) {
				item.contentId = attachment.contentId.replace(/^<|>$/g, '');
			}

			return item;
		});
	},

	async toResendAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentBase64(attachment);
			if (!content) {
				continue;
			}

			result.push({
				...attachment,
				content,
				contentType: attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream'
			});
		}

		return result;
	},

	async toArrayBufferAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentArrayBuffer(attachment);
			if (!content) {
				continue;
			}

			result.push({ ...attachment, content });
		}

		return result;
	},

	async toAttachmentBase64(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return content.replace(/\s+/g, '');
		}

		const arrayBuffer = await this.toAttachmentArrayBuffer(attachment);
		if (!arrayBuffer) {
			return null;
		}

		const bytes = new Uint8Array(arrayBuffer);
		let binary = '';

		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}

		return btoa(binary);
	},

	async toAttachmentArrayBuffer(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (content instanceof ArrayBuffer) {
			return content;
		}

		if (content instanceof Uint8Array) {
			return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return fileUtils.base64ToUint8Array(content.replace(/\s+/g, '')).buffer;
		}

		return content;
	},

	//处理站内邮件发送
	async HandleOnSiteEmail(c, receiveEmail, sendEmailData, attList) {

		const { noRecipient  } = await settingService.query(c);

		//查询所有收件人账号信息
		let accountList = await orm(c).select().from(account).where(inArray(account.email, receiveEmail)).all();

		// 对于含+未精确匹配的收件人，获取基础地址账号
		const plusEmails = receiveEmail.filter(
			e => e.includes('+') && !accountList.some(a => emailUtils.sameEmail(a.email, e))
		);
		const baseAccounts = [];
		if (plusEmails.length > 0) {
			const baseEmails = [...new Set(
				plusEmails.map(e => emailUtils.getBaseEmail(e)).filter(Boolean)
			)];
			const existing = new Set(accountList.map(a => emailUtils.normalizeEmail(a.email)));
			const needed = baseEmails.filter(e => !existing.has(e));
			if (needed.length > 0) {
				const rows = await orm(c).select().from(account)
					.where(inArray(account.email, needed)).all();
				baseAccounts.push(...rows);
			}
		}

		// 合并精确匹配和基础地址匹配的账号用于权限查询
		const allAccounts = [...accountList, ...baseAccounts];

		//查询所有收件人权限身份
		const userIds = allAccounts.map(accountRow => accountRow.userId);
		let roleList = await roleService.selectByUserIds(c, userIds);

		//封装数据库准备保存到数据库
		const emailDataList = [];

		for (const email of receiveEmail) {

			//把发件人邮件改成收件
			const emailValues = {...sendEmailData}
			// Bcc belongs only to the sender's Sent record. Every delivered copy is
			// stripped so neither To/Cc nor another Bcc recipient can discover it.
			emailValues.bcc = '[]';
			emailValues.status = emailConst.status.RECEIVE;
			emailValues.type = emailConst.type.RECEIVE;
			emailValues.toEmail = email;
			emailValues.toName = emailUtils.getName(email);
			emailValues.emailId = null;

			let accountRow = allAccounts.find(accountRow => emailUtils.sameEmail(accountRow.email, email));

			// 精确匹配不到时回退到主地址（去掉 +tag）
			if (!accountRow && email.includes('+')) {
				const baseEmail = emailUtils.getBaseEmail(email);
				accountRow = allAccounts.find(accountRow => emailUtils.sameEmail(accountRow.email, baseEmail));
			}

			//如果收件人存在就把邮件信息改成收件人的
			if (accountRow) {

				//设置给收件人保存
				emailValues.userId = accountRow.userId;
				emailValues.accountId = accountRow.accountId;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.RECEIVE;

				const roleRow = roleList.find(roleRow => roleRow.userId === accountRow.userId);

				let { banEmail, availDomain } = roleRow;

				//如果收件人没有这个域名的使用权限和有邮件拦截，就把邮件改为拒收状态
				if (!emailUtils.sameEmail(email, c.env.admin)) {

					if (!roleService.hasAvailDomainPerm(availDomain, email)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is not authorized to use this domain.`;
					} else if(roleService.isBanEmail(banEmail, sendEmailData.sendEmail)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is disabled from receiving emails.`;
					}

				}

				emailDataList.push(emailValues);

			} else {

				//设置无收件人邮件信息
				emailValues.userId = 0;
				emailValues.accountId = 0;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.NOONE;

				//如果无人收件关闭改为拒收
				if (noRecipient === settingConst.noRecipient.CLOSE) {
					emailValues.status = emailConst.status.BOUNCED;
					emailValues.message = `Recipient not found: <${email}>`;
				}

				emailDataList.push(emailValues);

			}

		}

		//保存邮件
		const receiveEmailList = emailDataList.filter(emailRow => emailRow.status === emailConst.status.RECEIVE || emailRow.status === emailConst.status.NOONE);

		for (const emailData of receiveEmailList) {

			// The recipient's copy belongs to the *recipient's* conversation: it
			// is resolved again in their own mailbox instead of inheriting the
			// sender's thread key.
			try {
				const thread = await threadService.resolveThreadForMessage(c, {
					userId: emailData.userId,
					messageId: emailData.messageId,
					inReplyTo: emailData.inReplyTo,
					references: emailData.relation,
					subject: emailData.subject,
					sendEmail: emailData.sendEmail,
					toEmail: emailData.toEmail,
					recipient: emailData.recipient
				});
				emailData.threadId = thread.threadId || threadService.newThreadId();
				emailData.parentMessageId = thread.parentMessageId || 0;
			} catch (error) {
				if (!threadService.isMissingThreadColumn(error)) throw error;
				// Pre-migration schema: store the copy without a conversation key.
				delete emailData.threadId;
				delete emailData.parentMessageId;
			}

			let emailRow = emailData.sendOperationId
				? await orm(c).insert(email).values(emailData).onConflictDoNothing().returning().get()
				: await orm(c).insert(email).values(emailData).returning().get();
			const inserted = Boolean(emailRow);
			if (!emailRow && emailData.sendOperationId) emailRow = await orm(c).select().from(email).where(and(
				eq(email.sendOperationId, emailData.sendOperationId), eq(email.type, emailConst.type.RECEIVE),
				eq(email.accountId, emailData.accountId), eq(email.toEmail, emailData.toEmail)
			)).get();
			if (!emailRow) throw new BizError('Internal delivery could not be recovered', 502);

			// The recipient may be a different user of this instance: notify their
			// devices too, so on-site mail behaves like an external delivery.
			if (inserted && emailRow.userId > 0 && emailRow.status === emailConst.status.RECEIVE) {
				pushService.scheduleNewMail(c, emailRow.userId, {
					emailId: emailRow.emailId,
					from: emailRow.sendEmail,
					subject: emailRow.subject,
				});
			}

			//设置附件保存
			for (const attRow of attList) {
				const attValues = {...attRow};
				attValues.emailId = emailRow.emailId;
				attValues.accountId = emailRow.accountId;
				attValues.userId = emailRow.userId;
				attValues.attId = null;
				const query = orm(c).insert(att).values(attValues);
				await (attValues.sendOperationId ? query.onConflictDoNothing() : query).run();
			}

		}

		const bouncedEmail = emailDataList.find(emailRow => emailRow.status === emailConst.status.BOUNCED);


		let status = emailConst.status.DELIVERED;
		let message = ''
		//如果有拒收邮件，就把发件人的邮件改成拒收
		if (bouncedEmail) {
			const messageJson = { message: bouncedEmail.message };
			message = JSON.stringify(messageJson);
			status = emailConst.status.BOUNCED;
		}

		await orm(c).update(email).set({ status, message: message }).where(eq(email.emailId, sendEmailData.emailId)).run();

	},

	imgReplace(content, cidAttList, r2domain) {

		if (!content) {
			return ''
		}

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		const useAtts = []

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('cid:') && cidAttList) {

				const cid = src.replace(/^cid:/, '');
				const attCidIndex = cidAttList.findIndex(cidAtt => cidAtt.contentId.replace(/^<|>$/g, '') === cid);

				if (attCidIndex > -1) {
					const cidAtt = cidAttList[attCidIndex];
					img.setAttribute('src', '{{domain}}' + cidAtt.key);
					useAtts.push(cidAtt)
				}

			}

			r2domain = domainUtils.toOssDomain(r2domain)

			if (src && src.startsWith(r2domain + '/')) {
				img.setAttribute('src', src.replace(r2domain + '/', '{{domain}}'));
			}

		}

		useAtts.forEach(att => {
			att.type = attConst.type.EMBED
		})

		return document.toString();
	},

	selectById(c, emailId, userId) {
		return orm(c).select().from(email).where(
			and(eq(email.emailId, emailId),
				userId === undefined ? undefined : eq(email.userId, userId),
				eq(email.isDel, isDel.NORMAL),
				eq(email.trashed, 0)))
			.get();
	},

	async latest(c, params, userId) {
		let { emailId, accountId, allReceive } = params;
		allReceive = Number(allReceive);

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		const list = await orm(c).select({ ...emailListColumns }).from(email)
			.innerJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.userId, userId),
					eq(email.isDel, isDel.NORMAL),
					// Archiving the newest message must not make the poll hand it
					// back to the list it was just removed from.
					eq(email.archived, 0),
					eq(email.trashed, 0),
					eq(account.isDel, isDel.NORMAL),
					allReceive ? undefined : eq(email.accountId, accountId),
					eq(email.type, emailConst.type.RECEIVE)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);
		for (const item of list) {
			item.listText = this.toListText(item);
		}
		await senderAvatarService.attach(c, list);
		return list;
	},

	async physicsDelete(c, params) {
		let { emailIds } = params;
		emailIds = emailIds.split(',').map(Number);
		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
	},

	async physicsDeleteUserIds(c, userIds) {
		await attService.removeByUserIds(c, userIds);
		await orm(c).delete(email).where(inArray(email.userId, userIds)).run();
	},

	updateEmailStatus(c, params) {
		const { status, resendEmailId, message } = params;
		return orm(c).update(email).set({
			status: status,
			message: message
		}).where(eq(email.resendEmailId, resendEmailId)).returning().get();
	},

	async updateEmailStatusMonotonic(c, { status, resendEmailId, message }) {
		const terminal = [emailConst.status.BOUNCED, emailConst.status.COMPLAINED, emailConst.status.FAILED];
		let condition = 'status = ?';
		let binds = [status, message ?? null, resendEmailId];
		if (status === emailConst.status.DELIVERED) {
			condition = 'status IN (?, ?)';
			binds.push(emailConst.status.SENT, emailConst.status.DELAYED);
		} else if (status === emailConst.status.DELAYED) {
			condition = 'status = ?';
			binds.push(emailConst.status.SENT);
		} else if (terminal.includes(status)) {
			condition = 'status NOT IN (?, ?, ?)';
			binds.push(...terminal);
		} else {
			// A late `sent` event cannot downgrade delivered or terminal mail.
			condition = 'status = ?';
			binds.push(emailConst.status.SENT);
		}
		return c.env.db.prepare(`UPDATE email SET status = ?, message = ? WHERE resend_email_id = ? AND ${condition} RETURNING *`)
			.bind(...binds).first();
	},

	async selectUserEmailCountList(c, userIds, type, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: email.userId,
				count: count(email.emailId)
			})
			.from(email)
			.where(and(
				inArray(email.userId, userIds),
				eq(email.type, type),
				eq(email.isDel, del),
				ne(email.status, emailConst.status.SAVING),
			))
			.groupBy(email.userId);
		return result;
	},

	async allList(c, params) {

		let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort, full } = params;

		size = pageSize(size);
		emailId = Number(emailId) || 0;
		timeSort = Number(timeSort);
		full = Number(full);

		if (type === undefined) {
			type = 'receive';
		}

		if (isNaN(full)) {
			full = 1;
		}

		full = full === 1;

		const filters = this.allEmailListFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort });
		const countFilters = this.allEmailListFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort, withCursor: false });
		const columns = full ? emailListColumns : emailBriefColumns;

		const query = orm(c).select({ ...columns, userEmail: user.email })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...filters));

		// count 不搜用户时无需 join user
		const queryCount = userEmail
			? orm(c).select({ total: count() })
				.from(email)
				.leftJoin(user, eq(email.userId, user.userId))
				.where(and(...countFilters))
			: orm(c).select({ total: count() })
				.from(email)
				.where(and(...countFilters));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();
		const totalQuery = queryCount.get();
		const latestEmailQuery = orm(c).select({
			emailId: email.emailId,
			accountId: email.accountId,
			userId: email.userId,
		}).from(email)
			.where(and(
				eq(email.type, emailConst.type.RECEIVE),
				eq(email.isDel, isDel.NORMAL),
				eq(email.trashed, 0),
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		if (full) {
			await this.emailAddAtt(c, list);
		} else {
			this.applyListText(list);
		}

		await senderAvatarService.attach(c, list);

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: 0,
				userId: 0,
			}
		}

		return { list: list, total: totalRow.total, latestEmail };
	},

	async allEmailLatest(c, params) {

		const { emailId } = params;

		let list = await orm(c).select({ ...emailListColumns, userEmail: user.email }).from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.type, emailConst.type.RECEIVE),
					eq(email.isDel, isDel.NORMAL),
					eq(email.trashed, 0)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);
		for (const item of list) {
			item.listText = this.toListText(item);
		}
		await senderAvatarService.attach(c, list);
		return list;
	},

	async emailAddAtt(c, list) {

		const emailIds = list.map(item => item.emailId);

		if (emailIds.length > 0) {

			const attList = await attService.selectByEmailIds(c, emailIds);

			list.forEach(emailRow => {
				const atts = attList.filter(attRow => attRow.emailId === emailRow.emailId);
				emailRow.attList = atts;
			});
		}
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.userId, userId)).run();
	},

	async completeReceive(c, status, emailId) {
		return await orm(c).update(email).set({
			isDel: isDel.NORMAL,
			status: status
		}).where(eq(email.emailId, emailId)).returning().get();
	},

	async completeReceiveAll(c) {
		// 用 EXISTS 走 status=6 部分索引 + account 主键；避免 IN (SELECT account_id FROM account) 触发全盘扫描
		await c.env.db.prepare(
			`UPDATE email
			 SET status = ${emailConst.status.RECEIVE}
			 WHERE status = ${emailConst.status.SAVING}
			   AND EXISTS (SELECT 1 FROM account WHERE account.account_id = email.account_id)`
		).run();
		await c.env.db.prepare(
			`UPDATE email
			 SET status = ${emailConst.status.NOONE}
			 WHERE status = ${emailConst.status.SAVING}`
		).run();
	},

	async autoClean(c) {
		const { autoCleanDays, autoCleanExclude } = await settingService.query(c);
		const days = Number(autoCleanDays);

		if (!days || days <= 0) {
			return;
		}

		const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD HH:mm:ss');
		const excludeEmails = String(autoCleanExclude || '')
			.split(/[,，]/)
			.map(item => item.trim())
			.filter(Boolean);

		let excludeUserIds = [];
		if (excludeEmails.length) {
			const rows = await orm(c)
				.select({ userId: user.userId })
				.from(user)
				.where(sql`lower(${user.email}) IN (${sql.join(excludeEmails.map(email => sql`${email.toLowerCase()}`), sql`, `)})`)
				.all();
			excludeUserIds = rows.map(row => row.userId);
		}

		const batchSize = 95;

		while (true) {
			const conditions = [lt(email.createTime, cutoff)];
			if (excludeUserIds.length) {
				conditions.push(notInArray(email.userId, excludeUserIds));
			}

			const rows = await orm(c)
				.select({ emailId: email.emailId })
				.from(email)
				.where(and(...conditions))
				.limit(batchSize)
				.all();

			if (!rows.length) {
				break;
			}

			const emailIds = rows.map(row => row.emailId);
			await this.physicsDelete(c, { emailIds: emailIds.join(',') });

			if (rows.length < batchSize) {
				break;
			}
		}
	},

	async batchDelete(c, params) {
		let { sendName, sendEmail, toEmail, subject, startTime, endTime, type  } = params

		let right = type === 'left' || type === 'include'
		let left = type === 'include'

		const conditions = []

		if (sendName) {
			conditions.push(like(email.name,`${left ? '%' : ''}${sendName}${right ? '%' : ''}`))
		}

		if (subject) {
			conditions.push(like(email.subject,`${left ? '%' : ''}${subject}${right ? '%' : ''}`))
		}

		if (sendEmail) {
			conditions.push(like(email.sendEmail,`${left ? '%' : ''}${sendEmail}${right ? '%' : ''}`))
		}

		if (toEmail) {
			conditions.push(like(email.toEmail,`${left ? '%' : ''}${toEmail}${right ? '%' : ''}`))
		}

		if (startTime && endTime) {
			conditions.push(gte(email.createTime,`${startTime}`))
			conditions.push(lte(email.createTime,`${endTime}`))
		}

		if (conditions.length === 0) {
			return;
		}

		const emailIdsRow = await orm(c).select({emailId: email.emailId}).from(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).all();

		const emailIds = emailIdsRow.map(row => row.emailId);

		if (emailIds.length === 0){
			return;
		}

		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);

		await orm(c).delete(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).run();
	},

	async physicsDeleteByAccountId(c, accountId) {
		await attService.removeByAccountId(c, accountId);
		const rows = await orm(c).select({ emailId: email.emailId }).from(email)
			.where(eq(email.accountId, accountId)).all();
		if (rows.length) await starService.removeByEmailIds(c, rows.map(row => row.emailId));
		await orm(c).delete(email).where(eq(email.accountId, accountId)).run();
	},

	async read(c, params, userId) {
		const { emailIds } = params;
		await orm(c).update(email).set({ unread: emailConst.unread.READ }).where(and(eq(email.userId, userId), inArray(email.emailId, emailIds)));
	},

	async unread(c, params, userId) {
		const { emailIds } = params;
		await orm(c).update(email).set({ unread: emailConst.unread.UNREAD }).where(and(eq(email.userId, userId), inArray(email.emailId, emailIds)));
	}
};

export default emailService;
