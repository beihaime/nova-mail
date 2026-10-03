import { describe, expect, it } from 'vitest'
import { MAIL_DENSITY_GEOMETRY, normalizeMailDensity } from '../src/utils/mail-density.js'

describe('mail list density', () => {
  it('defaults unknown values to normal', () => {
    expect(normalizeMailDensity(undefined)).toBe('normal')
    expect(normalizeMailDensity('wide')).toBe('normal')
    expect(normalizeMailDensity('compact')).toBe('compact')
  })

  it('makes every shared list row shorter without changing horizontal geometry', () => {
    for (const viewport of ['desktop', 'phone', 'phoneOther']) {
      expect(MAIL_DENSITY_GEOMETRY.compact[viewport]).toBeLessThan(MAIL_DENSITY_GEOMETRY.normal[viewport])
    }
  })
})
