import orm from '../entity/orm';
import email from '../entity/email';
import { and, asc, desc, eq, gt, or, sql } from 'drizzle-orm';
import { isDel } from '../const/entity-const';

/**
 * Conversation (thread) resolution.
 *
 * Nova Mail stores one row per message and keeps the conversation key on the
 * message itself (`email.thread_id`), so no separate table has to be kept in
 * sync. The Inbox then collapses rows by that key.
 *
 * Resolution priority — subject is deliberately the *last* resort because it
 * over-merges unrelated mail:
 *
 *   1. `In-Reply-To` matching a stored `message_id`
 *   2. any id in `References` matching a stored `message_id` (nearest first)
 *   3. the message already carrying a thread (re-delivery / internal copy)
 *   4. normalised subject, scoped to the same user + account
 *   5. otherwise start a new conversation
 */

// "Re:", "RE :", "Re[2]:", "Fwd:", "Fw:", "回复：", "答复:", "转发：", "转寄:"
const SUBJECT_PREFIX = /^\s*(?:(?:re|fwd?|fw|aw|sv|回复|答复|转发|转寄)\s*(?:\[\d+])?\s*[:：]\s*)+/i

/** Same normalisation the reader uses, so client and server agree. */
export function threadSubjectKey(subject) {
	return String(subject || '')
		.replace(SUBJECT_PREFIX, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/** RFC 5322 id without angle brackets, lower-cased for comparison. */
export function normalizeMessageId(value) {
	return String(value || '')
		.trim()
		.replace(/^<+/, '')
		.replace(/>+$/, '')
		.toLowerCase();
}

/**
 * `References` / `In-Reply-To` header → ordered, de-duplicated bare ids.
 * Accepts both `<a> <b>` and `a, b` shapes.
 */
export function parseMessageIdList(value) {
	const source = String(value || '');
	if (!source) return [];

	const bracketed = source.match(/<[^<>]+>/g);
	const parts = bracketed && bracketed.length ? bracketed : source.split(/[\s,]+/);

	const seen = new Set();
	const ids = [];

	for (const part of parts) {
		const id = normalizeMessageId(part);
		if (!id || seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}

	return ids;
}

/** `message_id` compared the way `normalizeMessageId` reads it. */
const bareMessageId = sql`lower(replace(replace(coalesce(${email.messageId}, ''), '<', ''), '>', ''))`;

export function newThreadId() {
	try {
		return crypto.randomUUID();
	} catch {
		return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
	}
}

/**
 * True when the error is D1 rejecting `thread_id` / `parent_message_id` because
 * the v3.6 migration has not run yet.
 *
 * The Worker is deployed before `/api/init` adds the columns, so inbound mail
 * arriving in that window must still be stored (without a conversation key)
 * instead of being rejected.
 */
export function isMissingThreadColumn(error) {
	const message = String(error?.message || error || '');
	return /no such column/i.test(message) && /thread_id|parent_message_id/i.test(message);
}

/** Empty in-memory index of an already-loaded message set. */
export function createThreadIndex() {
	return { byMessageId: new Map(), bySubject: new Map() };
}

/** Register a stored message so later messages can link back to it. */
export function indexThreadMessage(index, row, threadId) {
	const messageId = normalizeMessageId(row?.messageId);
	if (messageId && !index.byMessageId.has(messageId)) {
		index.byMessageId.set(messageId, { threadId, emailId: Number(row.emailId) || 0 });
	}

	const subjectKey = threadSubjectKey(row?.subject);
	if (subjectKey) {
		const key = `${row.userId ?? 0}|${row.accountId ?? 0}|${subjectKey}`;
		if (!index.bySubject.has(key)) {
			index.bySubject.set(key, { threadId, emailId: Number(row.emailId) || 0 });
		}
	}
}

/**
 * Pure resolution against an in-memory index. Used by the migration backfill
 * and unit tests; the live path uses `resolveThreadForMessage`.
 *
 * @returns {{threadId: string, parentMessageId: number}} `threadId === ''`
 *          means "no parent found, start a new conversation".
 */
export function resolveThreadKey(headers, index) {
	const byMessageId = index?.byMessageId || new Map();
	const bySubject = index?.bySubject || new Map();

	// Priority 1 + 2: In-Reply-To first, then References nearest-ancestor first.
	const candidates = [];
	const replyTo = normalizeMessageId(headers?.inReplyTo);
	if (replyTo) candidates.push(replyTo);
	// `references` is the header name; stored rows call the same value `relation`.
	const references = parseMessageIdList(headers?.references ?? headers?.relation);
	for (let i = references.length - 1; i >= 0; i--) candidates.push(references[i]);

	for (const id of candidates) {
		const hit = byMessageId.get(id);
		if (hit) return { threadId: hit.threadId, parentMessageId: hit.emailId };
	}

	// Priority 4: normalised subject, same user + account only.
	const subjectKey = threadSubjectKey(headers?.subject);
	if (subjectKey) {
		const hit = bySubject.get(`${headers?.userId ?? 0}|${headers?.accountId ?? 0}|${subjectKey}`);
		if (hit) return { threadId: hit.threadId, parentMessageId: 0 };
	}

	return { threadId: '', parentMessageId: 0 };
}

/** Stored rows whose `message_id` matches one of `ids` (bare comparison). */
async function selectByMessageIds(c, userId, ids) {
	const unique = [...new Set(ids.filter(Boolean))];
	const map = new Map();
	if (!unique.length) return map;

	const rows = await orm(c)
		.select({ emailId: email.emailId, threadId: email.threadId, messageId: email.messageId })
		.from(email)
		.where(and(
			eq(email.userId, userId),
			or(...unique.map(id => eq(bareMessageId, id)))
		))
		.orderBy(asc(email.emailId))
		.all();

	for (const row of rows) {
		const key = normalizeMessageId(row.messageId);
		// Oldest row wins: it is the original, and duplicates may lack a thread.
		if (key && !map.has(key)) map.set(key, row);
	}

	return map;
}

/**
 * Live resolution for an incoming (or locally generated) message.
 *
 * @param {object} c request context (D1 binding)
 * @param {{userId:number, accountId:number, messageId?:string, inReplyTo?:string,
 *          references?:string, subject?:string, threadId?:string,
 *          parentMessageId?:number}} headers
 * @returns {Promise<{threadId: string, parentMessageId: number}>}
 */
export async function resolveThreadForMessage(c, headers) {
	const userId = Number(headers?.userId) || 0;
	const accountId = Number(headers?.accountId) || 0;

	if (userId) {
		const candidates = [];
		const replyTo = normalizeMessageId(headers?.inReplyTo);
		if (replyTo) candidates.push(replyTo);

		const references = parseMessageIdList(headers?.references ?? headers?.relation);
		for (let i = references.length - 1; i >= 0; i--) candidates.push(references[i]);

		if (candidates.length) {
			const found = await selectByMessageIds(c, userId, candidates);
			for (const id of candidates) {
				const row = found.get(id);
				if (!row) continue;
				return {
					threadId: row.threadId || `e:${row.emailId}`,
					parentMessageId: Number(row.emailId) || 0,
				};
			}
		}
	}

	// Priority 3: the caller already knows the conversation (re-delivery, the
	// recipient copy of an on-site reply, …).
	if (headers?.threadId) {
		return {
			threadId: String(headers.threadId),
			parentMessageId: Number(headers.parentMessageId) || 0,
		};
	}

	// Priority 4: subject fallback over the most recent messages of this
	// user + account. Bounded so a huge mailbox never scans everything.
	const subjectKey = threadSubjectKey(headers?.subject);
	if (userId && subjectKey) {
		const recent = await orm(c)
			.select({ emailId: email.emailId, threadId: email.threadId, subject: email.subject })
			.from(email)
			.where(and(
				eq(email.userId, userId),
				eq(email.accountId, accountId),
				eq(email.isDel, isDel.NORMAL),
			))
			.orderBy(desc(email.emailId))
			.limit(50)
			.all();

		const hit = recent.find(row => threadSubjectKey(row.subject) === subjectKey);

		if (hit) {
			return {
				threadId: hit.threadId || `e:${hit.emailId}`,
				parentMessageId: 0,
			};
		}
	}

	return { threadId: '', parentMessageId: 0 };
}

/**
 * Message-ID dedupe guard for webhook / Cloudflare retries and internal
 * re-delivery. Returns the already-stored row, or null when the message is new.
 *
 * Rows without a Message-ID are never deduped (nothing reliable to match on);
 * deleted rows are still matched so a retry cannot resurrect deleted mail.
 */
export async function findExistingMessage(c, { userId, messageId }) {
	const id = normalizeMessageId(messageId);
	const owner = Number(userId) || 0;
	if (!id || !owner) return null;

	return orm(c)
		.select()
		.from(email)
		.where(and(
			eq(email.userId, owner),
			eq(bareMessageId, id),
		))
		.orderBy(asc(email.emailId))
		.get();
}

/**
 * Paged backfill core. IO is injected so the paging / grouping behaviour can be
 * unit tested without a D1 instance.
 *
 * @param {object} io
 * @param {(cursor:number, limit:number) => Promise<object[]>} io.readPage
 *        rows with thread_id = '' and email_id > cursor, ascending
 * @param {(updates: object[]) => Promise<void>} io.writeUpdates
 * @param {(processed:number) => void} [io.onProgress]
 */
export async function runThreadBackfill({
	readPage,
	writeUpdates,
	onProgress,
	pageSize = 2000,
	chunkSize = 100,
}) {
	const index = createThreadIndex();
	let cursor = 0;
	let total = 0;

	while (true) {
		const rows = await readPage(cursor, pageSize);
		if (!rows?.length) break;

		cursor = rows[rows.length - 1].emailId;

		const updates = [];

		for (const row of rows) {
			// `relation` holds the References header; the resolver accepts either.
			const resolved = resolveThreadKey({
				userId: row.userId,
				accountId: row.accountId,
				messageId: row.messageId,
				inReplyTo: row.inReplyTo,
				references: row.relation,
				subject: row.subject,
			}, index);

			const threadId = resolved.threadId || newThreadId();
			updates.push({ emailId: row.emailId, threadId, parentMessageId: resolved.parentMessageId || 0 });
			indexThreadMessage(index, row, threadId);
		}

		for (let i = 0; i < updates.length; i += chunkSize) {
			await writeUpdates(updates.slice(i, i + chunkSize));
		}

		total += updates.length;
		onProgress?.(total);

		if (rows.length < pageSize) break;
	}

	return total;
}

/**
 * One-off migration: assign `thread_id` to every pre-existing message.
 *
 * Messages are walked oldest → newest so the original of a conversation
 * establishes the key; replies then link back through In-Reply-To /
 * References, with the normalised subject (same user + account) as the
 * compatibility fallback that matches the reader's own grouping.
 *
 * The walk is paged by `email_id` and the updates are batched, so a large
 * mailbox never materialises in one query/response. Re-running is safe: already
 * assigned rows no longer match `thread_id = ''`.
 */
export async function backfillThreadIds(c) {
	let pages = 0;

	return runThreadBackfill({
		readPage: (cursor, limit) => orm(c)
			.select({
				emailId: email.emailId,
				userId: email.userId,
				accountId: email.accountId,
				messageId: email.messageId,
				inReplyTo: email.inReplyTo,
				relation: email.relation,
				subject: email.subject,
			})
			.from(email)
			.where(and(
				eq(email.threadId, ''),
				gt(email.emailId, cursor),
			))
			.orderBy(asc(email.emailId))
			.limit(limit)
			.all(),

		writeUpdates: (updates) => c.env.db.batch(updates.map(item => c.env.db
			.prepare('UPDATE email SET thread_id = ?, parent_message_id = ? WHERE email_id = ?')
			.bind(item.threadId, item.parentMessageId, item.emailId))),

		onProgress: (processed) => {
			pages++;
			if (pages % 10 === 0) {
				console.log(`会话线程回填进度：已处理 ${processed} 封邮件`);
			}
		},
	});
}

const threadService = {
	threadSubjectKey,
	normalizeMessageId,
	parseMessageIdList,
	newThreadId,
	createThreadIndex,
	indexThreadMessage,
	resolveThreadKey,
	resolveThreadForMessage,
	findExistingMessage,
	runThreadBackfill,
	backfillThreadIds,
};

export default threadService;
