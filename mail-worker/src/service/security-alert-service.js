import settingService from './setting-service';

const securityAlertService = {
  async notifyNewDevice(c, user, session) {
    const settings = await c.env.db.prepare('SELECT login_alert_email, login_alert_telegram, telegram_chat_id FROM user_security_settings WHERE user_id = ?').bind(user.userId).first();
    const config = await settingService.query(c);
    const location = [session.city, session.region, session.country].filter(Boolean).join(', ') || 'Location unavailable';
    const subject = 'New sign-in to Nova Mail';
    const text = `${subject}\n\nDevice: ${session.browser} on ${session.os}\nLocation: ${location}\nIP: ${session.ip_address || 'Unavailable'}\nTime: ${new Date(Number(session.created_at)).toISOString()}\n\nIf this was you, no action is needed.\nIf you don't recognize this activity, change your password and sign out of other sessions.`;
    const tasks = [];
    if (settings?.login_alert_email !== 0 && user.email) {
      if (c.env.email) {
        tasks.push(c.env.email.send({ from: c.env.admin, to: [user.email], subject, text }));
      } else {
        const domain = String(user.email).split('@')[1];
        const token = config.resendTokens && config.resendTokens[domain];
        if (token) {
          const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: c.env.admin, to: [user.email], subject, text }) });
          if (!response.ok) throw new Error(`security alert email failed: ${response.status}`);
        }
      }
    }
    if (settings?.login_alert_telegram && settings.telegram_chat_id && config.tgBotToken) {
      tasks.push(fetch(`https://api.telegram.org/bot${config.tgBotToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: settings.telegram_chat_id, text }) }));
    }
    await Promise.all(tasks);
  },
};

export default securityAlertService;
