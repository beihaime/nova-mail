/**
 * Composer send-time validation.
 *
 * Extracted from `layout/write/index.vue`: the rules are plain data checks, but
 * living inside an 800-line component made them impossible to test without
 * mounting Element Plus, the editor and the mail store. The component now only
 * maps the returned key to a translated message, so the order of the checks —
 * which is user-visible — is fixed in one place.
 *
 * The returned value is an i18n key, not a sentence, so this module stays free
 * of the translation layer.
 */

export const COMPOSE_ERROR = {
  RECIPIENT: 'emptyRecipientMsg',
  SUBJECT: 'emptySubjectMsg',
  CONTENT: 'emptyContentMsg',
  DIVIDED_ATTACHMENTS: 'noSeparateSendMsg',
  ALREADY_SENDING: 'sendingErrorMsg',
}

/**
 * @param {{
 *   recipientCount?: number,
 *   subject?: string,
 *   content?: string,
 *   attachmentCount?: number,
 *   manyType?: string,
 *   sending?: boolean,
 * }} compose
 * @returns {string|null} the first blocking i18n key, or null when sendable
 */
export function validateCompose({
  recipientCount = 0,
  subject = '',
  content = '',
  attachmentCount = 0,
  manyType = '',
  sending = false,
} = {}) {
  if (!recipientCount) return COMPOSE_ERROR.RECIPIENT
  if (!subject) return COMPOSE_ERROR.SUBJECT
  if (!content) return COMPOSE_ERROR.CONTENT
  // "Separate send" delivers one mail per recipient, so an attachment cannot be
  // shared across them.
  if (manyType === 'divide' && attachmentCount > 0) return COMPOSE_ERROR.DIVIDED_ATTACHMENTS
  if (sending) return COMPOSE_ERROR.ALREADY_SENDING

  return null
}
