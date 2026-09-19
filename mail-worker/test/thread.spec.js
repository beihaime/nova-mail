import { describe, expect, it } from 'vitest';
import {
  threadSubjectKey,
  normalizeMessageId,
  parseMessageIdList,
  createThreadIndex,
  indexThreadMessage,
  resolveThreadKey,
  isMissingThreadColumn,
  runThreadBackfill,
} from '../src/service/thread-service';

function storedRow(overrides) {
  return {
    emailId: 1,
    userId: 7,
    accountId: 3,
    subject: 'Nihao',
    messageId: '<root@mail.example>',
    inReplyTo: '',
    relation: '',
    sendEmail: 'dev@beihaime.com',
    toEmail: 'root@beihaime.com',
    recipient: JSON.stringify([{ address: 'root@beihaime.com', name: '' }]),
    ...overrides,
  };
}

/** Index a sequence of rows the way the backfill does (oldest → newest). */
function indexRows(rows) {
  const index = createThreadIndex();
  const assigned = [];
  for (const row of rows) {
    const resolved = resolveThreadKey(row, index);
    const threadId = resolved.threadId || `thread-${row.emailId}`;
    assigned.push({ ...row, threadId, parentMessageId: resolved.parentMessageId });
    indexThreadMessage(index, row, threadId);
  }
  return assigned;
}

describe('thread key helpers', () => {
  it('normalises subjects so replies of one conversation agree', () => {
    expect(threadSubjectKey('Re: Nihao')).toBe('nihao');
    expect(threadSubjectKey('RE :  Nihao')).toBe('nihao');
    expect(threadSubjectKey('Re[2]: Nihao')).toBe('nihao');
    expect(threadSubjectKey('Fwd: Re: Nihao')).toBe('nihao');
    expect(threadSubjectKey('回复：你好')).toBe('你好');
    expect(threadSubjectKey('转发: 你好')).toBe('你好');
    expect(threadSubjectKey('Nihao')).toBe('nihao');
    // Unrelated subjects must not collapse onto each other.
    expect(threadSubjectKey('Invoice')).not.toBe(threadSubjectKey('Nihao'));
  });

  it('strips angle brackets and case from Message-IDs', () => {
    expect(normalizeMessageId('<ABC@Mail.Example>')).toBe('abc@mail.example');
    expect(normalizeMessageId('abc@mail.example')).toBe('abc@mail.example');
    expect(normalizeMessageId('   ')).toBe('');
  });

  it('parses References in both bracketed and comma shapes', () => {
    expect(parseMessageIdList('<a@x> <b@x>')).toEqual(['a@x', 'b@x']);
    expect(parseMessageIdList('<a@x>, <b@x>')).toEqual(['a@x', 'b@x']);
    expect(parseMessageIdList('a@x, b@x')).toEqual(['a@x', 'b@x']);
    expect(parseMessageIdList('<a@x> <a@x>')).toEqual(['a@x']);
    expect(parseMessageIdList('')).toEqual([]);
  });
});

describe('thread resolution priority', () => {
  it('joins the conversation through In-Reply-To', () => {
    const index = createThreadIndex();
    indexThreadMessage(index, storedRow({ emailId: 1 }), 't1');

    const resolved = resolveThreadKey({
      userId: 7,
      accountId: 3,
      messageId: '<reply@mail.example>',
      inReplyTo: '<root@mail.example>',
      subject: 'Re: Nihao',
    }, index);

    expect(resolved).toEqual({ threadId: 't1', parentMessageId: 1 });
  });

  it('falls back to References when In-Reply-To is missing', () => {
    const index = createThreadIndex();
    indexThreadMessage(index, storedRow({ emailId: 1, messageId: '<a@x>' }), 't1');
    indexThreadMessage(index, storedRow({ emailId: 2, messageId: '<b@x>', subject: 'Re: Nihao' }), 't1');

    const resolved = resolveThreadKey({
      userId: 7,
      accountId: 3,
      messageId: '<c@x>',
      inReplyTo: '',
      references: '<a@x> <b@x>',
      subject: 'Re: Nihao',
    }, index);

    // Nearest ancestor wins (b, not a).
    expect(resolved).toEqual({ threadId: 't1', parentMessageId: 2 });
  });

  it('prefers a header match over a subject match', () => {
    const index = createThreadIndex();
    indexThreadMessage(index, storedRow({ emailId: 1, subject: 'Nihao' }), 'subject-thread');
    indexThreadMessage(index, storedRow({
      emailId: 2,
      subject: 'Other subject',
      messageId: '<parent@x>',
    }), 'header-thread');

    const resolved = resolveThreadKey({
      userId: 7,
      accountId: 3,
      inReplyTo: '<parent@x>',
      subject: 'Nihao',
      sendEmail: 'dev@beihaime.com',
      toEmail: 'root@beihaime.com',
    }, index);

    expect(resolved.threadId).toBe('header-thread');
  });

  it('reports "no parent" so the caller can start a new conversation', () => {
    const index = createThreadIndex();
    indexThreadMessage(index, storedRow({ emailId: 1 }), 't1');

    expect(resolveThreadKey({
      userId: 7,
      accountId: 3,
      inReplyTo: '<unknown@x>',
      subject: 'Totally different',
      sendEmail: 'dev@beihaime.com',
      toEmail: 'root@beihaime.com',
    }, index)).toEqual({ threadId: '', parentMessageId: 0 });
  });

  it('keeps unrelated subjects in separate conversations', () => {
    const assigned = indexRows([
      { emailId: 1, userId: 7, accountId: 3, subject: 'Nihao', messageId: '<n1@x>' },
      { emailId: 2, userId: 7, accountId: 3, subject: 'Invoice', messageId: '<i1@x>' },
      { emailId: 3, userId: 7, accountId: 3, subject: 'Re: Nihao', messageId: '<n2@x>', inReplyTo: '<n1@x>' },
    ]);

    expect(assigned[0].threadId).toBe('thread-1');
    expect(assigned[1].threadId).toBe('thread-2');
    expect(assigned[2].threadId).toBe('thread-1');
    expect(assigned[2].parentMessageId).toBe(1);
  });
});

/**
 * Subject is the last resort, so it has to be both useful (the user's own
 * addresses are separate accounts) and conservative (unrelated mail often
 * reuses a subject). Hence: per user, and only with a shared participant.
 */
describe('subject fallback', () => {
  const conversation = {
    sendEmail: 'dev@beihaime.com',
    toEmail: 'root@beihaime.com',
    recipient: JSON.stringify([{ address: 'root@beihaime.com', name: '' }]),
  };

  it('merges a reply that arrived at a different account of the same user', () => {
    const index = createThreadIndex();
    indexThreadMessage(index, storedRow({
      emailId: 1, userId: 7, accountId: 2, subject: '邮件1', ...conversation,
    }), 't1');

    // Same people, different mailbox (accountId 10) — the exact case that used
    // to open a second conversation.
    expect(resolveThreadKey({
      userId: 7, accountId: 10, subject: 'Re: 邮件1', ...conversation,
    }, index).threadId).toBe('t1');
  });

  it('merges when the counterpart address crosses from to_email to send_email', () => {
    const index = createThreadIndex();
    // Sent by the user to an external address.
    indexThreadMessage(index, storedRow({
      emailId: 1, userId: 7, accountId: 2, subject: 'Hello',
      sendEmail: 'me@beihaime.com',
      toEmail: 'friend@gmail.com',
      recipient: JSON.stringify([{ address: 'friend@gmail.com' }]),
    }), 't1');

    // The external reply: same subject, participants mirrored.
    expect(resolveThreadKey({
      userId: 7, accountId: 2, subject: 'Re: Hello',
      sendEmail: 'friend@gmail.com',
      toEmail: 'me@beihaime.com',
      recipient: JSON.stringify([{ address: 'me@beihaime.com' }]),
    }, index).threadId).toBe('t1');
  });

  it('never merges mail that only shares a subject', () => {
    const index = createThreadIndex();
    indexThreadMessage(index, storedRow({
      emailId: 1, userId: 7, accountId: 2, subject: 'Invoice',
      sendEmail: 'billing@shop-a.com',
      toEmail: 'me@beihaime.com',
      recipient: JSON.stringify([{ address: 'me@beihaime.com' }]),
    }), 't1');

    expect(resolveThreadKey({
      userId: 7, accountId: 2, subject: 'Invoice',
      sendEmail: 'billing@shop-b.com',
      toEmail: 'other@beihaime.com',
      recipient: JSON.stringify([{ address: 'other@beihaime.com' }]),
    }, index).threadId).toBe('');
  });

  it('never merges across users', () => {
    const index = createThreadIndex();
    indexThreadMessage(index, storedRow({
      emailId: 1, userId: 7, accountId: 2, subject: 'Nihao', ...conversation,
    }), 't1');

    expect(resolveThreadKey({
      userId: 8, accountId: 2, subject: 'Re: Nihao', ...conversation,
    }, index).threadId).toBe('');
  });
});

describe('conversation assembly', () => {
  it('groups a whole reply chain including a subject-edited reply', () => {
    const assigned = indexRows([
      { emailId: 10, userId: 7, accountId: 3, subject: 'Nihao', messageId: '<r1@x>' },
      // Reply 1 keeps the subject and links by header.
      { emailId: 11, userId: 7, accountId: 3, subject: 'Re: Nihao', messageId: '<r2@x>', inReplyTo: '<r1@x>' },
      // Reply 2 had its subject edited but still references reply 1.
      { emailId: 12, userId: 7, accountId: 3, subject: 'Different topic', messageId: '<r3@x>', inReplyTo: '<r2@x>' },
      // Reply 3 only carries References.
      { emailId: 13, userId: 7, accountId: 3, subject: 'Re: Nihao', messageId: '<r4@x>', relation: '<r1@x> <r3@x>' },
    ]);

    const threadIds = new Set(assigned.map(row => row.threadId));
    expect(threadIds.size).toBe(1);
    expect(assigned.map(row => row.parentMessageId)).toEqual([0, 10, 11, 12]);
  });

  it('is idempotent: re-running the backfill keeps the assigned threads', () => {
    const rows = [
      { emailId: 10, userId: 7, accountId: 3, subject: 'Nihao', messageId: '<r1@x>' },
      { emailId: 11, userId: 7, accountId: 3, subject: 'Re: Nihao', messageId: '<r2@x>', inReplyTo: '<r1@x>' },
    ];

    const first = indexRows(rows);
    const second = indexRows(first);

    expect(second.map(row => row.threadId)).toEqual(first.map(row => row.threadId));
  });
});

describe('pre-migration tolerance', () => {
  it('recognises the missing thread columns so mail is still stored', () => {
    expect(isMissingThreadColumn(new Error('D1_ERROR: no such column: thread_id at offset 42'))).toBe(true);
    expect(isMissingThreadColumn({ message: 'no such column: parent_message_id' })).toBe(true);
    // Anything else must still surface.
    expect(isMissingThreadColumn(new Error('D1_ERROR: no such column: something_else'))).toBe(false);
    expect(isMissingThreadColumn(new Error('D1_ERROR: network unavailable'))).toBe(false);
    expect(isMissingThreadColumn(undefined)).toBe(false);
  });
});

/**
 * The migration rewrites every existing row, so it is exercised against an
 * in-memory stand-in for D1: a table with a `thread_id` column plus the same
 * paged read / batched write contract the service uses.
 */
function fakeTable(seedRows) {
  // D1 fills the added column with its default, so every row starts unassigned.
  const rows = seedRows.map(row => ({ threadId: '', parentMessageId: 0, ...row }));
  let nextId = Math.max(0, ...rows.map(row => row.emailId)) + 1;
  const batches = [];

  return {
    rows,
    batches,
    insert(row) {
      rows.push({ ...row, emailId: nextId++, threadId: '' });
    },
    async readPage(cursor, limit) {
      // Mirrors: WHERE thread_id = '' AND email_id > cursor ORDER BY email_id ASC
      return rows
        .filter(row => row.threadId === '' && row.emailId > cursor)
        .sort((a, b) => a.emailId - b.emailId)
        .slice(0, limit);
    },
    async writeUpdates(updates) {
      batches.push(updates.length);
      const byId = new Map(updates.map(item => [item.emailId, item]));
      for (const row of rows) {
        const update = byId.get(row.emailId);
        if (!update) continue;
        row.threadId = update.threadId;
        row.parentMessageId = update.parentMessageId;
      }
    },
  };
}

describe('thread backfill migration', () => {
  function seed() {
    return [
      { emailId: 1, userId: 7, accountId: 3, subject: 'Nihao', messageId: '<n1@x>', inReplyTo: '', relation: '' },
      { emailId: 2, userId: 7, accountId: 3, subject: 'Invoice', messageId: '<i1@x>', inReplyTo: '', relation: '' },
      { emailId: 3, userId: 7, accountId: 3, subject: 'Re: Nihao', messageId: '<n2@x>', inReplyTo: '<n1@x>', relation: '' },
      { emailId: 4, userId: 7, accountId: 3, subject: 'Re: Nihao', messageId: '<n3@x>', inReplyTo: '', relation: '<n1@x> <n2@x>' },
      { emailId: 5, userId: 8, accountId: 9, subject: 'Re: Nihao', messageId: '<other@x>', inReplyTo: '', relation: '' },
    ];
  }

  it('assigns one conversation per reply chain and leaves other users alone', async () => {
    const table = fakeTable(seed());

    const total = await runThreadBackfill(table);
    expect(total).toBe(5);

    const [root, invoice, reply1, reply2, otherUser] = table.rows;
    expect(reply1.threadId).toBe(root.threadId);
    expect(reply2.threadId).toBe(root.threadId);
    expect(reply1.parentMessageId).toBe(1);
    // References are newest-last, so the nearest ancestor (<n2@x>, row 3) wins.
    expect(reply2.parentMessageId).toBe(3);
    // Same subject in another user's mailbox stays its own conversation.
    expect(otherUser.threadId).not.toBe(root.threadId);
    expect(invoice.threadId).not.toBe(root.threadId);
    expect(table.rows.every(row => row.threadId !== '')).toBe(true);
  });

  it('keeps a reply linked across a page boundary', async () => {
    const table = fakeTable(seed());

    // pageSize 2 forces the root and its reply onto different pages.
    await runThreadBackfill({ ...table, pageSize: 2 });

    const [root, , reply1] = table.rows;
    expect(reply1.threadId).toBe(root.threadId);
  });

  it('chunks the writes and never exceeds the batch size', async () => {
    const rows = Array.from({ length: 250 }, (_, index) => ({
      emailId: index + 1,
      userId: 7,
      accountId: 3,
      subject: `Thread ${index}`,
      messageId: `<m${index}@x>`,
      inReplyTo: '',
      relation: '',
    }));
    const table = fakeTable(rows);

    await runThreadBackfill({ ...table, pageSize: 100, chunkSize: 100 });

    expect(table.batches).toEqual([100, 100, 50]);
  });

  it('is a no-op when everything is already assigned', async () => {
    const rows = seed().map((row, index) => ({ ...row, threadId: `t${index}` }));
    const table = fakeTable(rows);

    expect(await runThreadBackfill(table)).toBe(0);
    expect(table.batches).toEqual([]);
  });

  /**
   * Regression for the reported Inbox duplicate: an on-site conversation
   * between two of the same user's addresses, where every message has an empty
   * Message-ID (outbound ids are provider generated, so the recipient copy has
   * nothing to link on) and the two sides live in different accounts.
   */
  it('groups one on-site conversation that spans two accounts', async () => {
    const dev = 'beihaime-dev@beihaime.com';
    const root = 'root@beihaime.com';
    const table = fakeTable([
      {
        emailId: 241, userId: 2, accountId: 2, subject: '邮件1',
        messageId: '', inReplyTo: '', relation: '',
        sendEmail: root, toEmail: dev, recipient: JSON.stringify([{ address: dev }]),
      },
      {
        emailId: 242, userId: 2, accountId: 10, subject: '邮件1',
        messageId: '', inReplyTo: '', relation: '',
        sendEmail: root, toEmail: dev, recipient: JSON.stringify([{ address: dev }]),
      },
      {
        emailId: 243, userId: 2, accountId: 10, subject: 'Re: 邮件1',
        messageId: '', inReplyTo: '', relation: '',
        sendEmail: dev, toEmail: root, recipient: JSON.stringify([{ address: root }]),
      },
      {
        emailId: 244, userId: 2, accountId: 2, subject: 'Re: 邮件1',
        messageId: '', inReplyTo: '', relation: '',
        sendEmail: dev, toEmail: root, recipient: JSON.stringify([{ address: root }]),
      },
    ]);

    await runThreadBackfill(table);

    const threads = new Set(table.rows.map(row => row.threadId));
    expect(threads.size).toBe(1);
    expect(table.rows.every(row => row.threadId !== '')).toBe(true);
  });
});
