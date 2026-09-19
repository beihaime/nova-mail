import { describe, expect, it } from 'vitest';
import {
  threadSubjectKey,
  normalizeMessageId,
  parseMessageIdList,
  createThreadIndex,
  indexThreadMessage,
  resolveThreadKey,
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
    }, index);

    expect(resolved.threadId).toBe('header-thread');
  });

  it('uses the normalised subject as the last resort, same user + account only', () => {
    const index = createThreadIndex();
    indexThreadMessage(index, storedRow({ emailId: 1, subject: 'Nihao' }), 't1');

    expect(resolveThreadKey({
      userId: 7,
      accountId: 3,
      subject: 'Re: Nihao',
    }, index).threadId).toBe('t1');

    // Another account (or user) with the same subject must not be merged.
    expect(resolveThreadKey({
      userId: 7,
      accountId: 99,
      subject: 'Re: Nihao',
    }, index).threadId).toBe('');

    expect(resolveThreadKey({
      userId: 8,
      accountId: 3,
      subject: 'Re: Nihao',
    }, index).threadId).toBe('');
  });

  it('reports "no parent" so the caller can start a new conversation', () => {
    const index = createThreadIndex();
    indexThreadMessage(index, storedRow({ emailId: 1 }), 't1');

    expect(resolveThreadKey({
      userId: 7,
      accountId: 3,
      inReplyTo: '<unknown@x>',
      subject: 'Totally different',
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
