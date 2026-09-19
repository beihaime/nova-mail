import { beforeEach, describe, expect, it, vi } from 'vitest';
import cryptoUtils from '../src/utils/crypto-utils';

const mocks = vi.hoisted(() => ({ getObj: vi.fn(), query: vi.fn() }));
vi.mock('../src/service/r2-service', () => ({ default: { getObj: mocks.getObj } }));
vi.mock('../src/service/setting-service', () => ({ default: { query: mocks.query } }));

import worker from '../src/index';
import { serveAttachmentById, servePrivateAttachment } from '../src/api/r2-api';
import attService from '../src/service/att-service';

// D1-compatible prepared-statement stub. It returns a row only when both
// the attachment and its email belong to the authenticated user.
function testDatabase(ownerId = 1, mimeType = 'image/png', overrides = {}) {
  const queries = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          queries.push({ sql, values });
          const owned = values.filter(value => value === ownerId).length >= 2;
          const row = { key: 'attachments/owner.png', filename: 'owner.png', mimeType,
            att_id: 1, user_id: ownerId, email_id: 7, account_id: 1, mime_type: mimeType, size: 4,
            ...overrides };
          const columnValues = sql.split(/\sfrom\s/i)[0].replace(/^select\s/i, '').split(',')
            .map(column => row[column.match(/"([^"]+)"\s*$/)?.[1]] ?? null);
          return {
            async raw() { return owned ? [columnValues] : []; },
            async all() { return { results: owned ? [row] : [] }; }
          };
        }
      };
    }
  };
  return { db, queries };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ r2Domain: null });
  mocks.getObj.mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71]), {
    headers: { 'Content-Type': 'image/png' }
  }));
});

describe('private mail attachments', () => {
  it('never serves the legacy /attachments/ route to an anonymous request', async () => {
    const response = await worker.fetch(new Request('https://mail.example/attachments/owner.png'), {}, {});
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.getObj).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated /api/oss request before any object lookup', async () => {
    const response = await worker.fetch(new Request('https://mail.example/api/oss/attachments/owner.png', {
      headers: { Authorization: 'invalid' }
    }), {}, {});
    expect((await response.json()).code).toBe(401);
    expect(mocks.getObj).not.toHaveBeenCalled();
  });
  it('allows an owner but refuses a non-owner before touching object storage', async () => {
    const { db, queries } = testDatabase();
    const context = (userId) => ({ env: { db }, req: { path: '/oss/attachments/owner.png' },
      get: () => ({ userId }), notFound: () => new Response('Not found', { status: 404 }) });
    const allowed = await servePrivateAttachment(context(1));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('cache-control')).toBe('private, no-store');
    expect(allowed.headers.get('x-content-type-options')).toBe('nosniff');
    expect(queries[0].sql).toContain('"attachments"."user_id" = ?');
    expect(queries[0].sql).toContain('"email"."user_id" = ?');
    mocks.getObj.mockClear();
    const denied = await servePrivateAttachment(context(2));
    expect(denied.status).toBe(404);
    expect(mocks.getObj).not.toHaveBeenCalled();
  });

  it('forces potentially active SVG attachments to download rather than same-origin inline execution', async () => {
    const { db } = testDatabase(1, 'image/svg+xml');
    const response = await servePrivateAttachment({ env: { db },
      req: { path: '/oss/attachments/owner.png' }, get: () => ({ userId: 1 }) });
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
  });

  it('refuses a foreign embedded key and permits an owned one', async () => {
    const { db, queries } = testDatabase();
    const context = { env: { db } };
    await expect(attService.toImageUrlHtml(context, '<img src="attachments/owner.png">', 2))
      .rejects.toMatchObject({ code: 404 });
    expect(mocks.getObj).not.toHaveBeenCalled();
    const result = await attService.toImageUrlHtml(context, '<img src="attachments/owner.png">', 1);
    expect(result.imageDataList).toHaveLength(1);
    expect(mocks.getObj).toHaveBeenCalledOnce();
    expect(queries.at(-1).sql).toContain('"email"."user_id" = ?');
  });
});

describe('attachment preview endpoint (/api/attachments/:id)', () => {
  // The reader addresses an attachment by its row id, so this route has to work
  // without a storage key in the URL and has to return the real content type —
  // PDFs included, which the key-addressed route never inlined.
  const context = (db, userId, id = '1') => ({
    env: { db },
    req: { param: () => id },
    get: () => ({ userId })
  });

  it('serves an owned image inline with its own content type', async () => {
    const { db, queries } = testDatabase();
    const response = await serveAttachmentById(context(db, 1));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(queries[0].sql).toContain('"attachments"."att_id" = ?');
    expect(queries[0].sql).toContain('"attachments"."user_id" = ?');
    expect(queries[0].sql).toContain('"email"."user_id" = ?');
  });

  it('serves a PDF inline so the browser viewer can render it', async () => {
    const { db } = testDatabase(1, 'application/pdf', { filename: 'report.pdf' });
    const response = await serveAttachmentById(context(db, 1));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
  });

  it('falls back to the filename when no usable type was recorded', async () => {
    // KV answers `application/octet-stream` for objects stored without a type,
    // which must not win over the extension.
    mocks.getObj.mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), {
      headers: { 'Content-Type': 'application/octet-stream' }
    }));

    const { db } = testDatabase(1, null, { filename: 'report.pdf' });
    const response = await serveAttachmentById(context(db, 1));

    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
  });

  it('keeps unknown types as a generic download', async () => {
    const { db } = testDatabase(1, 'application/zip', { filename: 'archive.zip' });
    const response = await serveAttachmentById(context(db, 1));

    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
  });

  it('never serves another user’s attachment and never touches storage', async () => {
    const { db } = testDatabase(1);
    mocks.getObj.mockClear();

    const response = await serveAttachmentById(context(db, 2));

    expect(response.status).toBe(404);
    expect(mocks.getObj).not.toHaveBeenCalled();
  });

  it('rejects a missing id without querying', async () => {
    const { db, queries } = testDatabase();
    mocks.getObj.mockClear();

    const response = await serveAttachmentById(context(db, 1, ''));

    expect(response.status).toBe(404);
    expect(queries).toHaveLength(0);
    expect(mocks.getObj).not.toHaveBeenCalled();
  });

  it('requires authentication before any lookup', async () => {
    const response = await worker.fetch(new Request('https://mail.example/api/attachments/1', {
      headers: { Authorization: 'invalid' }
    }), {}, {});
    expect((await response.json()).code).toBe(401);
    expect(mocks.getObj).not.toHaveBeenCalled();
  });
});

describe('password hash compatibility', () => {
  it('upgrades only a verified legacy password to the current format', async () => {
    const legacy = await cryptoUtils.genLegacyHashPassword('correct', 'legacy-salt');
    expect(cryptoUtils.isLegacyPasswordHash(legacy)).toBe(true);
    expect(await cryptoUtils.verifyPassword('wrong', 'legacy-salt', legacy)).toBe(false);
    expect(await cryptoUtils.verifyPassword('correct', 'legacy-salt', legacy)).toBe(true);
    const { salt, hash } = await cryptoUtils.hashPassword('correct');
    expect(cryptoUtils.isLegacyPasswordHash(hash)).toBe(false);
    expect(await cryptoUtils.verifyPassword('correct', salt, hash)).toBe(true);
  });
});
