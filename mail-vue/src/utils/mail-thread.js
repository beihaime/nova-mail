/**
 * Conversation-thread helpers.
 *
 * Nova Mail stores one row per message (`email` table) and has no thread
 * endpoint, so a conversation is assembled on the client out of the messages
 * that share a normalised subject and/or are linked by their Message-ID /
 * In-Reply-To headers.
 *
 * The original email object is preserved on every thread message (see
 * `toThreadMessage`), so `email.content`, `email.attList` etc. keep working.
 */

import { buildMessagePreview } from './quoted-text.js'

// "Re:", "RE :", "Re[2]:", "Fwd:", "Fw:", "回复：", "答复:", "转发：", "转寄:"
const SUBJECT_PREFIX = /^\s*(?:(?:re|fwd?|fw|aw|sv|回复|答复|转发|转寄)\s*(?:\[\d+])?\s*[:：]\s*)+/i

/** `emailConst.type.SEND` — messages sent by the account that owns them. */
const TYPE_SEND = 1

/**
 * Normalise a subject so every reply/forward of one conversation shares a key.
 * Returns an empty string when there is nothing left to match on.
 */
export function threadSubjectKey(subject) {
    return String(subject || '')
        .replace(SUBJECT_PREFIX, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
}

/** Raw email id used to dedupe/sort messages. */
function messageId(raw) {
    return Number(raw?.emailId ?? raw?.id) || 0
}

function messageKey(raw) {
    return String(messageId(raw) || raw?.localId || '')
}

/** Header id (Message-ID) for reply-chain matching, angle brackets stripped. */
function headerId(value) {
    return String(value || '').trim().replace(/^<|>$/g, '')
}

/**
 * Identity used to dedupe thread messages.
 *
 * Prefers the row id (brief and full rows of the same email share it), then the
 * RFC 5322 `Message-ID` header (the same message delivered twice under two row
 * ids), then the local id, and finally a sender + timestamp + subject
 * signature. Two rows sharing an identity are one message.
 */
export function threadMessageKey(raw) {
    const id = messageId(raw)
    if (id) return `e:${id}`

    const header = headerId(raw?.messageId)
    if (header) return `m:${header}`

    const local = String(raw?.localId || '')
    if (local) return `l:${local}`

    const time = String(raw?.createTime || raw?.date || '')
    return `t:${raw?.sendEmail || ''}|${time}|${threadSubjectKey(raw?.subject)}`
}

/**
 * Map a raw email row onto a thread message.
 *
 * Every original field is kept (`...raw`) so downstream code that expects
 * `content`, `attList`, `cc`, … keeps working; only the display helpers are
 * added/overridden on top.
 */
export function toThreadMessage(raw) {
    const emailId = messageId(raw)

    return {
        ...raw,
        id: messageKey(raw),
        emailId,
        localId: raw?.localId || '',
        subject: raw?.subject || '',
        from: {
            name: raw?.name || raw?.sendEmail || '',
            email: raw?.sendEmail || '',
        },
        recipient: raw?.recipient || '[]',
        cc: raw?.cc || '[]',
        bcc: raw?.bcc || '[]',
        date: raw?.createTime || '',
        content: raw?.content || '',
        // Brief list rows drop `text` and expose `listText` instead, so fall
        // back to it: without this a not-yet-loaded message renders nothing.
        text: raw?.text || raw?.listText || '',
        // Collapsed-card summary: the first paragraph of the *new* text only.
        // Quoted history, "On … wrote:" headers, forwarded blocks and raw
        // markup are stripped here, so they can never reach a collapsed card.
        preview: buildMessagePreview(raw),
        attachments: raw?.attList || raw?.attachments || [],
        status: raw?.status,
        message: raw?.message,
        unread: raw?.unread,
        isStar: !!raw?.isStar,
        isMine: Number(raw?.type) === TYPE_SEND,
        local: !!raw?.local,
    }
}

function messageOrder(message) {
    if (message.emailId > 0) return message.emailId

    const parsed = Date.parse(
        String(message.date || '').replace(' ', 'T') + 'Z'
    )

    // A freshly appended local message is always the newest one.
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

/** True when the row may join the conversation (same account, identifiable). */
function isCandidate(primary, raw) {
    if (!raw) return false
    if (!messageId(raw) && !raw.localId) return false

    // Never merge conversations that belong to different accounts.
    if (
        primary?.accountId != null &&
        raw.accountId != null &&
        raw.accountId !== primary.accountId
    ) return false

    return true
}

/**
 * Build the ordered message list of the conversation `primary` belongs to.
 *
 * Grouping uses, in order:
 *  1. the normalised subject (Re:/Fwd: stripped), and
 *  2. the Message-ID / In-Reply-To reply graph, expanded until it stops growing
 *     (covers replies whose subject was edited).
 *
 * @param {object} primary currently opened email
 * @param {object[]} pool other already-loaded emails (e.g. the store detailMap)
 * @param {object[]} extra locally appended messages (just-sent replies/forwards)
 * @returns {{subject: string, messages: object[]}} messages oldest → newest
 */
export function buildThreadMessages(primary, pool = [], extra = []) {
    const key = threadSubjectKey(primary?.subject)
    const collected = new Map()
    // Message-ID header -> identity of the message already holding it. Guards
    // against the same reply arriving twice under two different row ids.
    const headerOwners = new Map()

    const others = Array.isArray(pool) ? pool : []

    const push = (raw) => {
        const identity = threadMessageKey(raw)
        if (!identity) return false

        const header = headerId(raw?.messageId)

        if (header && headerOwners.has(header)) {
            // Same message, another row id: upgrade to the richer row if the
            // stored one has no body yet.
            const ownerKey = headerOwners.get(header)
            const owner = collected.get(ownerKey)
            if (owner && !owner.content && raw?.content) {
                collected.set(ownerKey, raw)
            }
            return false
        }

        const existing = collected.get(identity)

        if (existing) {
            // The list first delivers brief rows (no `content`), the full rows
            // arrive later with the same id. Keep the richer row so the body and
            // attachments are never dropped, no matter which one is seen first.
            if (!existing.content && raw?.content) {
                collected.set(identity, raw)
            }
            if (header) headerOwners.set(header, identity)
            return false
        }

        collected.set(identity, raw)
        if (header) headerOwners.set(header, identity)
        return true
    }

    // Seed with the message the reader opened.
    push(primary)

    // 1) Same normalised subject.
    if (key) {
        for (const raw of [...others, ...extra]) {
            if (!isCandidate(primary, raw)) continue
            if (threadSubjectKey(raw.subject) !== key) continue
            push(raw)
        }
    }

    // 2) Reply graph — grow until no new message can be linked.
    let grew = true
    while (grew) {
        grew = false

        const knownMessageIds = new Set()
        const knownReplyTargets = new Set()

        for (const raw of collected.values()) {
            const id = headerId(raw.messageId)
            if (id) knownMessageIds.add(id)

            const inReplyTo = headerId(raw.inReplyTo)
            if (inReplyTo) knownReplyTargets.add(inReplyTo)
        }

        for (const raw of [...others, ...extra]) {
            if (!isCandidate(primary, raw)) continue
            if (collected.has(threadMessageKey(raw))) continue

            const id = headerId(raw.messageId)
            const inReplyTo = headerId(raw.inReplyTo)

            const linksBack = id && knownReplyTargets.has(id)
            const repliedTo = inReplyTo && knownMessageIds.has(inReplyTo)

            if (linksBack || repliedTo) {
                // Only a real insertion counts as growth: a duplicate arriving
                // under another row id must not keep the loop spinning.
                if (push(raw)) grew = true
            }
        }
    }

    return {
        subject: primary?.subject || '',
        messages: [...collected.values()]
            .map(toThreadMessage)
            .sort((a, b) => messageOrder(a) - messageOrder(b)),
    }
}
