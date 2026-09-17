import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ select: vi.fn(), projection: null }));
vi.mock('../src/entity/orm', () => ({ default: () => ({ select: mocks.select }) }));
vi.mock('../src/service/email-service', () => ({
  default: { selectUserEmailCountList: vi.fn(async () => []) }
}));
vi.mock('../src/service/account-service', () => ({
  default: { selectUserAccountCountList: vi.fn(async () => []) }
}));
vi.mock('../src/service/role-service', () => ({
  default: { selectByIdsHasPermKey: vi.fn(async () => []) }
}));

import userService from '../src/service/user-service';

describe('user list serialization', () => {
  it('uses a positive allowlist and never exposes a stored password hash or salt', async () => {
    const databaseRow = { userId: 1, email: 'owner@example.com', type: 1, status: 0,
      password: 'sensitive-hash', salt: 'sensitive-salt', isDel: 0 };
    mocks.select.mockImplementation((projection) => {
      const query = {
        from: () => query, leftJoin: () => query, where: () => query,
        orderBy: () => query, limit: () => query,
        offset: async () => {
          mocks.projection = projection;
          return [Object.fromEntries(Object.keys(projection).map(key => [key, databaseRow[key] ?? null]))];
        },
        get: async () => ({ total: 1 })
      };
      return query;
    });
    const result = await userService.list({ env: { admin: 'admin@example.com' } },
      { num: 1, size: 10, status: -1, isDel: 0 });
    expect(result.total).toBe(1);
    expect(result.list[0].email).toBe(databaseRow.email);
    expect(mocks.projection).not.toHaveProperty('password');
    expect(mocks.projection).not.toHaveProperty('salt');
    expect(JSON.stringify(result)).not.toContain('sensitive-hash');
    expect(JSON.stringify(result)).not.toContain('sensitive-salt');
  });
});
