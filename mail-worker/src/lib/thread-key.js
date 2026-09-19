/**
 * Conversation (thread) key resolution — pure, dependency-free logic.
 *
 * Kept in `lib/` (no D1 / drizzle imports) so the exact same algorithm can run
 * in three places:
 *   - the Worker's receive path (`service/thread-service.js`)
 *   - the v3.6 migration backfill
 *   - `scripts/rebuild-threads.mjs`, which repairs an already-migrated database
 *     locally without needing a Worker secret
 *
 * Resolution priority — subject is deliberately the *last* resort because it
 * over-merges unrelated mail:
 *
 *   1. `In-Reply-To` matching a stored `message_id`
 *   2. any id in `References` matching a stored `message_id` (nearest first)
 *   3. the message already carrying a thread (re-delivery / internal copy)
 *   4. normalised subject, same user, and only with a shared participant
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

// Bound on how many siblings a subject bucket keeps in memory.
const SUBJECT_BUCKET_LIMIT = 50;

/**
 * Every address a stored message involves: sender, delivered recipient and the
 * `recipient` list. Used to keep the subject fallback from merging unrelated
 * conversations that merely share a subject.
 */
export function messageAddresses(raw) {
	const addresses = new Set();

	const push = (value) => {
		const address = String(value || '').trim().toLowerCase();
		if (address) addresses.add(address);
	};

	push(raw?.sendEmail);
	push(raw?.toEmail);

	const list = raw?.recipient;
	let parsed = list;

	if (typeof list === 'string') {
		try {
			parsed = JSON.parse(list);
		} catch {
			parsed = null;
		}
	}

	if (Array.isArray(parsed)) {
		for (const item of parsed) {
			push(typeof item === 'string' ? item : item?.address);
		}
	}

	return addresses;
}

/** True when the two address sets share at least one participant. */
export function sharesParticipant(left, right) {
	if (!left?.size || !right?.size) return false;
	const [small, large] = left.size <= right.size ? [left, right] : [right, left];
	for (const address of small) {
		if (large.has(address)) return true;
	}
	return false;
}

/** Register a stored message so later messages can link back to it. */
export function indexThreadMessage(index, row, threadId) {
	const messageId = normalizeMessageId(row?.messageId);
	if (messageId && !index.byMessageId.has(messageId)) {
		index.byMessageId.set(messageId, { threadId, emailId: Number(row.emailId) || 0 });
	}

	const subjectKey = threadSubjectKey(row?.subject);
	if (subjectKey) {
		// Subject buckets are per user (not per account): a conversation can span
		// several of the user's addresses. Participant overlap keeps it honest.
		const key = `${row.userId ?? 0}|${subjectKey}`;
		const bucket = index.bySubject.get(key) || [];
		bucket.push({
			threadId,
			emailId: Number(row.emailId) || 0,
			addresses: messageAddresses(row),
		});
		if (bucket.length > SUBJECT_BUCKET_LIMIT) bucket.shift();
		index.bySubject.set(key, bucket);
	}
}

/**
 * Pure resolution against an in-memory index.
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

	// Priority 4: normalised subject, same user only (a conversation can span
	// several of the user's addresses), and only when the two messages actually
	// share a participant — otherwise two unrelated "Invoice" mails would merge.
	const subjectKey = threadSubjectKey(headers?.subject);
	if (subjectKey) {
		const bucket = bySubject.get(`${headers?.userId ?? 0}|${subjectKey}`);
		if (bucket?.length) {
			const wanted = messageAddresses(headers);
			// Newest sibling first: the most recent matching conversation wins.
			for (let i = bucket.length - 1; i >= 0; i--) {
				if (sharesParticipant(wanted, bucket[i].addresses)) {
					return { threadId: bucket[i].threadId, parentMessageId: 0 };
				}
			}
		}
	}

	return { threadId: '', parentMessageId: 0 };
}

/**
 * Paged backfill core. IO is injected so the paging / grouping behaviour can be
 * unit tested (and reused by the repair script) without a D1 instance.
 *
 * @param {object} io
 * @param {(cursor:number, limit:number) => Promise<object[]>} io.readPage
 *        rows ascending by `emailId`; `threadId` is ignored/recomputed
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
			// Spread the row so the resolver also sees the participant columns
			// (sendEmail / toEmail / recipient) that the subject fallback needs;
			// `relation` holds the References header.
			const resolved = resolveThreadKey({
				...row,
				references: row.relation,
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
