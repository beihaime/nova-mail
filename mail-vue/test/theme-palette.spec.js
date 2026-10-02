import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PALETTES,
  applyPaletteTokens,
  findMatchingPreset,
  normalizeHex,
  normalizePalette,
  parseThemeImport,
} from '../src/utils/theme-palette.js'

describe('theme palettes', () => {
  it('normalizes valid hex colours and rejects malformed values', () => {
    expect(normalizeHex(' #0a84ff ')).toBe('#0A84FF')
    expect(normalizeHex('#abc')).toBeNull()
    expect(normalizeHex('blue')).toBeNull()
  })

  it('fills an incomplete persisted palette from its mode defaults', () => {
    expect(normalizePalette({ accent: '#112233' }, DEFAULT_PALETTES.light)).toEqual({
      ...DEFAULT_PALETTES.light,
      accent: '#112233',
    })
  })

  it('only accepts imports containing complete light and dark palettes', () => {
    const valid = parseThemeImport({ light: DEFAULT_PALETTES.light, dark: DEFAULT_PALETTES.dark })
    expect(valid.light).toEqual(DEFAULT_PALETTES.light)
    expect(valid.dark).toEqual(DEFAULT_PALETTES.dark)
    expect(parseThemeImport({ light: DEFAULT_PALETTES.light, dark: { accent: '#000000' } })).toBeNull()
  })

  it('marks manually changed palettes as custom', () => {
    expect(findMatchingPreset('dark', { ...DEFAULT_PALETTES.dark, border: '#101010' })).toBe('custom')
    expect(findMatchingPreset('light', DEFAULT_PALETTES.light)).toBe('nova-default')
  })

  it('applies a palette through shared root tokens', () => {
    const values = {}
    applyPaletteTokens({ style: { setProperty: (key, value) => { values[key] = value } } }, DEFAULT_PALETTES.dark, 'dark')
    expect(values['--nova-surface']).toBe('#17191D')
    expect(values['--el-color-primary']).toBe('#0A84FF')
    expect(values['--el-bg-color']).toBe('#17191D')
  })
})
