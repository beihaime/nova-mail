import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PALETTES,
  APPEARANCE_SCHEMA_VERSION,
  applyPaletteTokens,
  findMatchingPreset,
  migrateAppearanceConfig,
  normalizeHex,
  normalizePalette,
  paletteForPreset,
  parseThemeImport,
  resolvePaletteMode,
  availablePresets,
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

  it('builds a layered default Light token hierarchy', () => {
    const values = {}
    applyPaletteTokens({ style: { setProperty: (key, value) => { values[key] = value } } }, DEFAULT_PALETTES.light, 'light')
    expect(values['--nm-bg']).toBe('#F5F6F8')
    expect(values['--nm-surface']).not.toBe(values['--nm-bg'])
    expect(values['--nm-surface-elevated']).toBe('#FFFFFF')
    expect(values['--nm-selected']).not.toBe(values['--nm-accent'])
    expect(values['--aside-menu-active-background']).toBe(values['--nm-selected'])
    expect(values['--nova-button-active']).toBe(values['--nm-accent-subtle'])
    expect(values['--nova-danger']).toBe('#C73C3C')
  })

  it('builds the same semantic hierarchy for the default Dark palette', () => {
    const values = {}
    applyPaletteTokens({ style: { setProperty: (key, value) => { values[key] = value } } }, DEFAULT_PALETTES.dark, 'dark')
    expect(values['--nova-surface']).toBe('#17191D')
    expect(values['--el-color-primary']).toBe('#0A84FF')
    expect(values['--el-bg-color']).toBe('#17191D')
    expect(values['--nm-surface']).not.toBe(values['--nm-bg'])
    expect(values['--nm-selected']).not.toBe(values['--nm-accent'])
    expect(values['--nova-danger']).toBe('#FF7B72')
  })

  it('derives interaction tokens from a custom palette without reusing its raw accent', () => {
    const values = {}
    const custom = { ...DEFAULT_PALETTES.light, accent: '#C026D3', background: '#F9F5FA' }
    applyPaletteTokens({ style: { setProperty: (key, value) => { values[key] = value } } }, custom, 'light')
    expect(values['--nm-accent']).toBe('#C026D3')
    expect(values['--nm-selected']).not.toBe('#C026D3')
    expect(values['--nova-hover']).not.toBe('#C026D3')
  })

  it('migrates legacy persisted palettes safely and remains stable after reload', () => {
    const legacy = {
      lightPalette: { ...DEFAULT_PALETTES.light, accent: '#112233' },
      darkPalette: { accent: 'invalid', surface: '#202020' },
    }
    const migrated = migrateAppearanceConfig(legacy)
    expect(migrated.appearanceVersion).toBe(APPEARANCE_SCHEMA_VERSION)
    expect(migrated.lightPalette.accent).toBe('#112233')
    expect(migrated.darkPalette).toEqual({ ...DEFAULT_PALETTES.dark, surface: '#202020' })
    expect(migrateAppearanceConfig(migrated)).toEqual(migrated)
  })

  it('resets each palette to the Nova default preset', () => {
    expect(paletteForPreset('light', 'nova-default')).toEqual(DEFAULT_PALETTES.light)
    expect(paletteForPreset('dark', 'nova-default')).toEqual(DEFAULT_PALETTES.dark)
  })

  it('provides only the supported preset collection without weakening palette validation', () => {
    const expectedPresets = [
      'nova-default', 'terracotta', 'forest', 'lavender', 'matcha', 'graphite', 'sakura', 'arctic', 'mocha',
      'amber', 'aurora', 'cobalt', 'orchid', 'crimson', 'pine', 'lunar', 'cyber',
    ]
    expect(availablePresets('light')).toEqual(expectedPresets)
    expect(availablePresets('dark')).toEqual(expectedPresets)
    expect(paletteForPreset('dark', 'forest')).toEqual(expect.objectContaining({ accent: '#70A984' }))

    for (const mode of ['light', 'dark']) {
      const paletteKey = `${mode}Palette`
      const presetKey = `${mode}ThemePreset`
      expect(migrateAppearanceConfig({
        [paletteKey]: paletteForPreset(mode, 'lavender'),
        [presetKey]: 'rose',
      })[presetKey]).toBe('lavender')
    }

    for (const mode of ['light', 'dark']) {
      for (const preset of availablePresets(mode)) {
        const palette = paletteForPreset(mode, preset)
        expect(normalizePalette(palette, DEFAULT_PALETTES[mode])).toEqual(palette)
        expect(paletteForPreset(mode, findMatchingPreset(mode, palette))).toEqual(palette)

        const values = {}
        applyPaletteTokens({ style: { setProperty: (key, value) => { values[key] = value } } }, palette, mode)
        expect(values).toEqual(expect.objectContaining({
          '--nm-bg': palette.background,
          '--nm-surface-elevated': palette.surface,
          '--nm-text-primary': palette.foreground,
          '--nm-text-secondary': expect.any(String),
          '--nm-text-muted': expect.any(String),
          '--nm-border': palette.border,
          '--nm-accent': palette.accent,
          '--nm-accent-subtle': expect.any(String),
          '--nm-hover': expect.any(String),
          '--nm-selected': expect.any(String),
          '--nova-button-focus-ring': expect.any(String),
          '--nova-danger': expect.any(String),
        }))
      }
    }
  })

  it('resolves System mode without mutating either palette', () => {
    expect(resolvePaletteMode('system', false)).toBe('light')
    expect(resolvePaletteMode('system', true)).toBe('dark')
    expect(resolvePaletteMode('light', true)).toBe('light')
    expect(resolvePaletteMode('dark', false)).toBe('dark')
  })
})
