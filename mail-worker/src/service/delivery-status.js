import { emailConst } from '../const/entity-const';

const FAILURE_STATUSES = new Set([
  emailConst.status.BOUNCED,
  emailConst.status.COMPLAINED,
  emailConst.status.FAILED,
]);

function safeFailureReason(value) {
  if (!value) return '';
  let text = String(value).trim();
  try {
    const parsed = JSON.parse(text);
    text = parsed?.reason || parsed?.message || parsed?.bounce?.reason || parsed?.bounce?.message || '';
  } catch (_) {
    // Legacy rows may already contain plain text.
  }
  return String(text).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function userStatus(status) {
  if (status === emailConst.status.SAVING) return 'pending';
  if (status === emailConst.status.DELIVERED) return 'delivered';
  if (status === emailConst.status.DELAYED) return 'delayed';
  if (FAILURE_STATUSES.has(status)) return 'failed';
  if (status === emailConst.status.SENT) return 'sent';
  return 'pending';
}

/** Attach only owner-safe delivery metadata to already owner-scoped rows. */
async function attachDeliveryInfo(c, rows) {
  const outgoing = rows.filter(row => Number(row.type) === emailConst.type.SEND && row.emailId);
  if (!outgoing.length) return rows;

  const ids = outgoing.map(row => Number(row.emailId));
  const placeholders = ids.map(() => '?').join(',');
  const result = await c.env.db.prepare(`SELECT email_id, status, message, updated_at
    FROM resend_recipient_delivery WHERE email_id IN (${placeholders})`).bind(...ids).all();
  const byEmail = new Map();
  for (const delivery of result.results || []) {
    const key = Number(delivery.email_id);
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key).push(delivery);
  }

  for (const row of outgoing) {
    const recipients = byEmail.get(Number(row.emailId)) || [];
    const status = Number(row.status);
    const statusRows = recipients.length ? recipients : [{ status, message: row.message, updated_at: null }];
    const allDelivered = recipients.length > 0 && recipients.every(item => Number(item.status) === emailConst.status.DELIVERED);
    const aggregate = recipients.some(item => Number(item.status) === emailConst.status.COMPLAINED)
      ? emailConst.status.COMPLAINED
      : recipients.some(item => Number(item.status) === emailConst.status.BOUNCED)
        ? emailConst.status.BOUNCED
        : recipients.some(item => Number(item.status) === emailConst.status.FAILED)
          ? emailConst.status.FAILED
          : allDelivered
            ? emailConst.status.DELIVERED
            : recipients.some(item => Number(item.status) === emailConst.status.DELAYED)
              ? emailConst.status.DELAYED
          : status;
    const failure = statusRows.find(item => FAILURE_STATUSES.has(Number(item.status)) && safeFailureReason(item.message));
    const delivered = recipients
      .filter(item => Number(item.status) === emailConst.status.DELIVERED)
      .map(item => Number(item.updated_at) || 0)
      .filter(Boolean);

    row.deliveryStatus = userStatus(aggregate);
    row.sentAt = row.createTime || null;
    row.deliveredAt = delivered.length ? new Date(Math.max(...delivered)).toISOString() : null;
    row.deliveryFailureReason = failure ? safeFailureReason(failure.message) : '';
    if (FAILURE_STATUSES.has(aggregate)) row.message = row.deliveryFailureReason || null;
  }
  return rows;
}

export { attachDeliveryInfo, safeFailureReason, userStatus };
