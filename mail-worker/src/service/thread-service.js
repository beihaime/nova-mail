import orm from '../entity/orm';
import email from '../entity/email';
import { and, asc, desc, eq, gt, or, sql } from 'drizzle-orm';
import { isDel } from '../const/entity-const';
import {
	threadSubjectKey,
	normalizeMessageId,
	parseMessageIdList,
	newThreadId,
	isMissingThreadColumn,
	createThreadIndex,
	indexThreadMessage,
	messageAddresses,
	sharesParticipant,
	resolveThreadKey,
	runThreadBackfill,
} from '../lib/thread-key';

/**
 * Conversation (thread) resolution — database side.
 *
 * The algorithm itself lives in `../lib/thread-key` (dependency free, so the
 * repair script can reuse it). This module only adds the D1 queries and
 * re-exports the pure helpers for existing callers and tests.
 */

export {
	threadSubjectKey,
	normalizeMessageId,
	parseMessageIdList,
	newThreadId,
	isMissingThreadColumn,
	createThreadIndex,
	indexThreadMessage,
	messageAddresses,
	sharesParticipant,
	resolveThreadKey,
	runThreadBackfill,
};

/** `message_id` compared the way `normalizeMessageId` reads it. */
const bareMessageId = sql`lower(replace(replace(coalesce(${email.messageId}, ''), '<', ''), '>', ''))`;

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
 * @param {{userId:number, messageId?:string, inReplyTo?:string, references?:string,
 *          subject?:string, threadId?:string, parentMessageId?:number,
 *          sendEmail?:string, toEmail?:string, recipient?:string|Array}} headers
 * @returns {Promise<{threadId: string, parentMessageId: number}>}
 */
export async function resolveThreadForMessage(c, headers) {
	const userId = Number(headers?.userId) || 0;

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

	// Priority 4: subject fallback over the user's most recent messages. It is
	// deliberately per user (a conversation can span several of the user's
	// addresses) and still requires a shared participant, so unrelated mail that
	// merely reuses a subject never merges.
	const subjectKey = threadSubjectKey(headers?.subject);
	if (userId && subjectKey) {
		const recent = await orm(c)
			.select({
				emailId: email.emailId,
				threadId: email.threadId,
				subject: email.subject,
				sendEmail: email.sendEmail,
				toEmail: email.toEmail,
				recipient: email.recipient,
			})
			.from(email)
			.where(and(
				eq(email.userId, userId),
				eq(email.isDel, isDel.NORMAL),
			))
			.orderBy(desc(email.emailId))
			.limit(100)
			.all();

		const wanted = messageAddresses(headers);
		const hit = recent.find(row =>
			threadSubjectKey(row.subject) === subjectKey
			&& sharesParticipant(wanted, messageAddresses(row))
		);

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
 * One-off migration: assign `thread_id` to every pre-existing message.
 *
 * Messages are walked oldest → newest so the original of a conversation
 * establishes the key; replies then link back through In-Reply-To /
 * References, with the normalised subject (same user, shared participant) as
 * the compatibility fallback that matches the reader's own grouping.
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
				// Needed by the subject fallback's participant check.
				sendEmail: email.sendEmail,
				toEmail: email.toEmail,
				recipient: email.recipient,
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
	isMissingThreadColumn,
	createThreadIndex,
	indexThreadMessage,
	messageAddresses,
	sharesParticipant,
	resolveThreadKey,
	resolveThreadForMessage,
	findExistingMessage,
	runThreadBackfill,
	backfillThreadIds,
};

export default threadService;
