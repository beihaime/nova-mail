import { describe, expect, it } from 'vitest'
import { COMPOSE_ERROR, validateCompose } from '../src/utils/compose-validate.js'

/**
 * Compose validation decides whether a click on Send is allowed at all. It
 * returns i18n keys, so the assertions stay independent of the translation
 * files while still pinning the *order* the user experiences.
 */
describe('validateCompose', () => {
  const complete = {
    recipientCount: 1,
    subject: 'Hello',
    content: '<p>body</p>',
    attachmentCount: 0,
    manyType: 'single',
    sending: false,
  }

  it('accepts a complete message', () => {
    expect(validateCompose(complete)).toBeNull()
  })

  it('requires at least one recipient', () => {
    expect(validateCompose({ ...complete, recipientCount: 0 })).toBe(COMPOSE_ERROR.RECIPIENT)
  })

  it('requires a subject', () => {
    expect(validateCompose({ ...complete, subject: '' })).toBe(COMPOSE_ERROR.SUBJECT)
  })

  it('requires a body', () => {
    expect(validateCompose({ ...complete, content: '' })).toBe(COMPOSE_ERROR.CONTENT)
  })

  it('reports the recipient problem before the subject one', () => {
    expect(validateCompose({ ...complete, recipientCount: 0, subject: '' })).toBe(
      COMPOSE_ERROR.RECIPIENT,
    )
  })

  it('reports the subject problem before the body one', () => {
    expect(validateCompose({ ...complete, subject: '', content: '' })).toBe(COMPOSE_ERROR.SUBJECT)
  })

  it('rejects attachments in separate-send mode', () => {
    expect(
      validateCompose({ ...complete, manyType: 'divide', attachmentCount: 2 }),
    ).toBe(COMPOSE_ERROR.DIVIDED_ATTACHMENTS)
  })

  it('allows attachments when they are not split per recipient', () => {
    expect(
      validateCompose({ ...complete, manyType: 'single', attachmentCount: 2 }),
    ).toBeNull()
  })

  it('blocks a second send while one is in flight, after the content checks', () => {
    expect(validateCompose({ ...complete, sending: true })).toBe(COMPOSE_ERROR.ALREADY_SENDING)
    // An empty body is reported before "already sending".
    expect(validateCompose({ ...complete, content: '', sending: true })).toBe(
      COMPOSE_ERROR.CONTENT,
    )
  })

  it('treats a missing argument object as an empty draft', () => {
    expect(validateCompose()).toBe(COMPOSE_ERROR.RECIPIENT)
    expect(validateCompose({})).toBe(COMPOSE_ERROR.RECIPIENT)
  })
})
