import { v4 as uuidv4 } from 'uuid';
import constant from '../const/constant';
import BizError from '../error/biz-error';

const THROTTLE_MS = 5 * 60 * 1000;

async function hashToken(token) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseUserAgent(userAgent = '', pwa = false) {
  const ua = userAgent;
  const mobile = /Android|iPhone|Mobile/i.test(ua);
  const tablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua);
  const deviceType = tablet ? 'Tablet' : mobile ? 'Mobile' : ua ? 'Desktop' : 'Unknown';
  const os = /Windows/i.test(ua) ? 'Windows' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Mac OS X/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Unknown';
  const browser = pwa ? 'Installed PWA' : /Edg\//i.test(ua) ? 'Edge' : /Firefox\//i.test(ua) ? 'Firefox' : /CriOS\//i.test(ua) ? 'Chrome' : /Chrome\//i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : /OPR\//i.test(ua) ? 'Opera' : 'Unknown';
  return { deviceType, os, browser };
}

function requestMetadata(c, metadata = {}) {
  const userAgent = c.req.header('User-Agent') || '';
  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || '';
  const parsed = parseUserAgent(userAgent, metadata.pwa === true);
  return {
    ...parsed,
    userAgent,
    ip,
    country: c.req.header('CF-IPCountry') || '',
    region: '',
    city: '',
    deviceId: String(metadata.deviceId || '').slice(0, 128),
  };
}

function locationText(row) {
  return [row.city, row.region, row.country].filter(Boolean).join(', ') || 'Location unavailable';
}

const sessionService = {
  hashToken,
  parseUserAgent,
  requestMetadata,
  async create(c, userId, token, metadata = {}) {
    const now = Date.now();
    const sessionId = uuidv4();
    const info = requestMetadata(c, metadata);
    const tokenHash = await hashToken(token);
    await c.env.db.prepare(`INSERT INTO auth_session (session_id,user_id,token_hash,device_id,device_type,browser,os,user_agent,ip_address,country,region,city,created_at,last_active_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(sessionId, userId, tokenHash, info.deviceId, info.deviceType, info.browser, info.os, info.userAgent, info.ip, info.country, info.region, info.city, now, now, now + constant.TOKEN_EXPIRE * 1000).run();
    return { sessionId, isNewDevice: await sessionService.isNewDevice(c, userId, info.deviceId, info.deviceType, info.browser, info.os, sessionId) };
  },
  async isNewDevice(c, userId, deviceId, deviceType, browser, os, excludeSessionId = '') {
    if (deviceId) {
      const row = await c.env.db.prepare('SELECT session_id FROM auth_session WHERE user_id = ? AND device_id = ? AND session_id != ? LIMIT 1').bind(userId, deviceId, excludeSessionId).first();
      return !row;
    }
    const row = await c.env.db.prepare('SELECT session_id FROM auth_session WHERE user_id = ? AND device_type = ? AND browser = ? AND os = ? AND session_id != ? LIMIT 1').bind(userId, deviceType, browser, os, excludeSessionId).first();
    return !row;
  },
  async findByToken(c, token) {
    if (!token) return null;
    const hash = await hashToken(token);
    return c.env.db.prepare('SELECT * FROM auth_session WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?').bind(hash, Date.now()).first();
  },
  async touch(c, row) {
    if (!row || Date.now() - Number(row.last_active_at) < THROTTLE_MS) return;
    await c.env.db.prepare('UPDATE auth_session SET last_active_at = ? WHERE session_id = ? AND revoked_at IS NULL').bind(Date.now(), row.session_id).run();
  },
  async list(c, userId, currentId) {
    const rows = await c.env.db.prepare('SELECT * FROM auth_session WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_active_at DESC').bind(userId, Date.now()).all();
    return (rows.results || []).map((row) => ({
      id: row.session_id, deviceType: row.device_type, browser: row.browser, os: row.os,
      userAgent: row.user_agent, ipAddress: row.ip_address || 'Unavailable', location: locationText(row),
      createdAt: new Date(Number(row.created_at)).toISOString(), lastActiveAt: new Date(Number(row.last_active_at)).toISOString(),
      current: row.session_id === currentId,
    }));
  },
  async revoke(c, userId, sessionId, currentId) {
    if (sessionId === currentId) throw new BizError('The current session cannot be signed out here', 400);
    const result = await c.env.db.prepare('UPDATE auth_session SET revoked_at = ? WHERE session_id = ? AND user_id = ? AND revoked_at IS NULL').bind(Date.now(), sessionId, userId).run();
    if (!result.meta?.changes) throw new BizError('Session not found', 404);
  },
  async revokeOthers(c, userId, currentId) {
    await c.env.db.prepare('UPDATE auth_session SET revoked_at = ? WHERE user_id = ? AND session_id != ? AND revoked_at IS NULL').bind(Date.now(), userId, currentId).run();
  },
  async alerts(c, userId) {
    const row = await c.env.db.prepare('SELECT login_alert_email, login_alert_telegram FROM user_security_settings WHERE user_id = ?').bind(userId).first();
    const settings = row || { login_alert_email: 1, login_alert_telegram: 0, telegram_chat_id: '' };
    return { email: Boolean(settings.login_alert_email), telegram: Boolean(settings.login_alert_telegram), telegramAvailable: Boolean(settings.telegram_chat_id) };
  },
  async updateAlerts(c, userId, input) {
    const current = await sessionService.alerts(c, userId);
    const telegram = Boolean(input.telegram) && current.telegramAvailable;
    await c.env.db.prepare(`INSERT INTO user_security_settings (user_id,login_alert_email,login_alert_telegram) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET login_alert_email=excluded.login_alert_email, login_alert_telegram=excluded.login_alert_telegram`).bind(userId, input.email === undefined ? Number(current.email) : Number(Boolean(input.email)), Number(telegram)).run();
    return sessionService.alerts(c, userId);
  },
};

export default sessionService;
