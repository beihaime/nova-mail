import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { api, createAccount, sessionFor } from './helpers';
import loginService from '../../src/service/login-service';
import KvConst from '../../src/const/kv-const';

describe('Devices & Sessions', () => {
  it('lists only the caller sessions and marks the current session', async () => {
    const owner = await createAccount();
    const principal = await sessionFor(owner);
    const other = await createAccount();
    await sessionFor(other);

    const response = await api('/api/account/sessions', { token: principal.token });
    const body = await response.json();
    expect(body.code).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].current).toBe(true);
    expect(body.data[0].ipAddress).toBe('Unavailable');
  });

  it('revokes one session and rejects its token immediately', async () => {
    const owner = await createAccount();
    const current = await sessionFor(owner);
    const secondToken = await loginService.createSession({ env, req: { header: () => '' } }, owner.user);
    const second = await env.db.prepare('SELECT session_id FROM auth_session WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(owner.userId).first();

    const revoke = await api(`/api/account/sessions/${second.session_id}`, { token: current.token, method: 'DELETE' });
    expect((await revoke.json()).code).toBe(200);
    const denied = await api('/api/account/sessions', { token: secondToken });
    expect((await denied.json()).code).toBe(401);
  });

  it('changes a password while keeping only the current D1 and KV session', async () => {
    const owner = await createAccount();
    const current = await sessionFor(owner);
    const otherToken = await loginService.createSession({ env, req: { header: () => '' } }, owner.user);

    const changed = await api('/api/my/resetPassword', {
      token: current.token, method: 'PUT', body: { password: 'new-test-password' },
    });
    expect((await changed.json()).code).toBe(200);

    const other = await api('/api/my/loginUserInfo', { token: otherToken });
    expect((await other.json()).code).toBe(401);
    const stillCurrent = await api('/api/my/loginUserInfo', { token: current.token });
    expect((await stillCurrent.json()).code).toBe(200);

    const sessions = await env.db.prepare('SELECT revoked_at FROM auth_session WHERE user_id = ?').bind(owner.userId).all();
    expect(sessions.results.filter(row => row.revoked_at === null)).toHaveLength(1);
    const authInfo = await env.kv.get(KvConst.AUTH_INFO + owner.userId, { type: 'json' });
    expect(authInfo.tokens).toHaveLength(1);
  });

  it('cannot revoke another user session', async () => {
    const owner = await createAccount();
    const ownerSession = await sessionFor(owner);
    const victim = await createAccount();
    await sessionFor(victim);
    const victimRow = await env.db.prepare('SELECT session_id FROM auth_session WHERE user_id = ? LIMIT 1').bind(victim.userId).first();
    const response = await api(`/api/account/sessions/${victimRow.session_id}`, { token: ownerSession.token, method: 'DELETE' });
    expect((await response.json()).code).toBe(404);
  });

  it('revoke others keeps the current session and excludes expired/revoked rows', async () => {
    const owner = await createAccount();
    const current = await sessionFor(owner);
    await loginService.createSession({ env, req: { header: () => '' } }, owner.user);
    const response = await api('/api/account/sessions/revoke-others', { token: current.token, method: 'POST' });
    expect((await response.json()).code).toBe(200);
    const list = await (await api('/api/account/sessions', { token: current.token })).json();
    expect(list.data).toHaveLength(1);
    expect(list.data[0].current).toBe(true);
  });

  it('does not list expired or revoked sessions', async () => {
    const owner = await createAccount();
    const current = await sessionFor(owner);
    await env.db.prepare('UPDATE auth_session SET expires_at = ? WHERE user_id = ? AND session_id != (SELECT session_id FROM auth_session WHERE user_id = ? ORDER BY created_at DESC LIMIT 1)').bind(Date.now() - 1, owner.userId, owner.userId).run();
    const list = await (await api('/api/account/sessions', { token: current.token })).json();
    expect(list.data.every((session) => session.current)).toBe(true);
  });

  it('does not repeat the new-device signal for a known persistent device', async () => {
    const owner = await createAccount();
    const context = { env, req: { header: (name) => name === 'User-Agent' ? 'Mozilla/5.0 Chrome Android' : '' } };
    const first = await loginService.createSession(context, owner.user, { deviceId: 'known-device' });
    const second = await loginService.createSession(context, owner.user, { deviceId: 'known-device' });
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    const rows = await env.db.prepare('SELECT device_id FROM auth_session WHERE user_id = ? AND device_id = ?').bind(owner.userId, 'known-device').all();
    expect(rows.results).toHaveLength(2);
  });
});
