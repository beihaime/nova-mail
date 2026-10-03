import { describe, expect, it } from 'vitest';
import { api, createAccount, sessionFor } from './helpers';

describe('mail list density preference', () => {
  it('defaults to normal, saves per user, and survives a new session', async () => {
    const owner = await createAccount();
    const first = await sessionFor(owner);
    const initial = await (await api('/api/account/preferences', { token: first.token })).json();
    expect(initial.data).toEqual({ mailListDensity: 'normal' });

    const update = await (await api('/api/account/preferences', {
      token: first.token, method: 'PATCH', body: { mailListDensity: 'compact' },
    })).json();
    expect(update.data).toEqual({ mailListDensity: 'compact' });

    const second = await sessionFor(owner);
    const reloaded = await (await api('/api/account/preferences', { token: second.token })).json();
    expect(reloaded.data).toEqual({ mailListDensity: 'compact' });

    const other = await sessionFor(await createAccount());
    const isolated = await (await api('/api/account/preferences', { token: other.token })).json();
    expect(isolated.data).toEqual({ mailListDensity: 'normal' });
  });

  it('rejects unauthenticated and invalid updates without changing the saved value', async () => {
    const owner = await sessionFor(await createAccount());
    expect((await (await api('/api/account/preferences')).json()).code).toBe(401);
    expect((await (await api('/api/account/preferences', {
      token: owner.token, method: 'PATCH', body: { mailListDensity: 'invalid' },
    })).json()).code).toBe(400);
    expect((await (await api('/api/account/preferences', { token: owner.token })).json()).data)
      .toEqual({ mailListDensity: 'normal' });
  });
});
