/**
 * Conversation-thread helpers.
 *
 * Nova Mail stores one row per message (`email` table) and has no thread
 * endpoint, so a conversation is assembled on the client from the messages that
 * share a normalised subject.
 */

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

/** Map a raw email row onto the shape used by the thread UI. */
export function toThreadMessage(raw) {
    const emailId = Number(raw?.emailId ?? raw?.id) || 0

    return {
        id: String(emailId || raw?.localId || ''),
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
        text: raw?.text || '',
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

/**
 * Build the ordered message list of the conversation `primary` belongs to.
 *
 * @param {object} primary currently opened email
 * @param {object[]} pool other already-loaded emails (e.g. the store detailMap)
 * @param {object[]} extra locally appended messages (just-sent replies/forwards)
 * @returns {object[]} messages oldest → newest
 */
export function buildThreadMessages(primary, pool = [], extra = []) {
    const messages = new Map()
    const key = threadSubjectKey(primary?.subject)

    const add = (raw) => {
        const emailId = Number(raw?.emailId) || 0
        if (!emailId && !raw?.localId) return

        const id = String(emailId || raw.localId)
        if (messages.has(id)) return

        messages.set(id, toThreadMessage(raw))
    }

    if (key) {
        for (const item of pool) {
            if (!item) continue
            // Never merge conversations that belong to different accounts.
            if (
                primary?.accountId != null &&
                item.accountId != null &&
                item.accountId !== primary.accountId
            ) continue
            if (threadSubjectKey(item.subject) !== key) continue
            add(item)
        }

        for (const item of extra) {
            if (threadSubjectKey(item?.subject) !== key) continue
            add(item)
        }
    }

    add(primary)

    return [...messages.values()].sort((a, b) => messageOrder(a) - messageOrder(b))
}
