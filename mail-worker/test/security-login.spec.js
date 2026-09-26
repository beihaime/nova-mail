import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ selectUser: vi.fn(), limit: vi.fn(), update: vi.fn() }));
vi.mock('../src/service/user-service', () => ({
  default: { selectByEmailIncludeDel: mocks.selectUser }
}));
vi.mock('../src/utils/rate-limit-utils', () => ({ default: { login: vi.fn() } }));
vi.mock('../src/entity/orm', () => ({ default: () => ({ update: mocks.update }) }));

import loginService from '../src/service/login-service';
import cryptoUtils from '../src/utils/crypto-utils';

beforeEach(() => {
  vi.clearAllMocks();
  const updateQuery = {
    set: vi.fn(() => updateQuery), where: vi.fn(() => updateQuery),
    returning: vi.fn(() => updateQuery), get: vi.fn(async () => ({ userId: 1 }))
  };
  mocks.update.mockReturnValue(updateQuery);
});

describe('rehash on password login', () => {
  it('upgrades a legacy hash after successful verification and the next login uses PBKDF2', async () => {
    const row = { userId: 1, email: 'owner@example.com', salt: 'legacy-salt',
      password: await cryptoUtils.genLegacyHashPassword('correct', 'legacy-salt'), isDel: 0, status: 0 };
    mocks.selectUser.mockResolvedValue(row);
    const createSession = vi.spyOn(loginService, 'createSession').mockResolvedValue('session');
    try {
      const context = { env: {} };
      await expect(loginService.login(context, { email: row.email, password: 'wrong' })).rejects.toThrow();
      expect(mocks.update).not.toHaveBeenCalled();

      expect(await loginService.login(context, { email: row.email, password: 'correct' })).toBe('session');
      expect(row.password).toMatch(/^pbkdf2:100000:/);
      expect(mocks.update).toHaveBeenCalledOnce();
      expect(await cryptoUtils.verifyPassword('correct', row.salt, row.password)).toBe(true);

      expect(await loginService.login(context, { email: row.email, password: 'correct' })).toBe('session');
      expect(mocks.update).toHaveBeenCalledOnce();
      expect(createSession).toHaveBeenCalledTimes(2);
    } finally {
      createSession.mockRestore();
    }
  });

  it('never rehashes the OAuth compatibility path without password verification', async () => {
    const row = { userId: 1, email: 'owner@example.com', salt: 'old',
      password: await cryptoUtils.genLegacyHashPassword('secret', 'old'), isDel: 0, status: 0 };
    mocks.selectUser.mockResolvedValue(row);
    const createSession = vi.spyOn(loginService, 'createSession').mockResolvedValue('session');
    try {
      await loginService.login({ env: {} }, { email: row.email }, true);
      expect(mocks.update).not.toHaveBeenCalled();
    } finally {
      createSession.mockRestore();
    }
  });
});
