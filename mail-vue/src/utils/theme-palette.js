export const PALETTE_KEYS = ['accent', 'background', 'foreground', 'surface', 'border']

// Only the five base palette colours are persisted. Interaction and surface
// colours are derived in `applyPaletteTokens`, so a custom accent never turns
// every selected/hover state into a primary button.
export const APPEARANCE_SCHEMA_VERSION = 2

export const DEFAULT_PALETTES = {
  light: {
    accent: '#0A84FF',
    background: '#F5F6F8',
    foreground: '#1F2937',
    surface: '#FFFFFF',
    border: '#E5E7EB',
  },
  dark: {
    accent: '#0A84FF',
    background: '#1C1D20',
    foreground: '#E5E7EB',
    surface: '#17191D',
    border: '#383A3F',
  },
}

const PRESETS = {
  light: {
    'nova-default': DEFAULT_PALETTES.light,
    'soft-light': {
      accent: '#5B7CFA', background: '#F7F6F3', foreground: '#292724', surface: '#FFFEFB', border: '#E7E3DB',
    },
  },
  dark: {
    'nova-default': DEFAULT_PALETTES.dark,
    midnight: {
      accent: '#6EA8FE', background: '#111827', foreground: '#E5EDF9', surface: '#172033', border: '#334155',
    },
  },
}

const HEX = /^#[0-9a-f]{6}$/i

export function normalizeHex(value) {
  const hex = String(value || '').trim()
  return HEX.test(hex) ? hex.toUpperCase() : null
}

export function clonePalette(palette) {
  return Object.fromEntries(PALETTE_KEYS.map((key) => [key, palette[key]]))
}

export function normalizePalette(palette, fallback) {
  return Object.fromEntries(PALETTE_KEYS.map((key) => [
    key,
    normalizeHex(palette?.[key]) || fallback[key],
  ]))
}

export function paletteForPreset(mode, preset) {
  const fallback = DEFAULT_PALETTES[mode]
  return clonePalette(PRESETS[mode]?.[preset] || fallback)
}

export function availablePresets(mode) {
  return Object.keys(PRESETS[mode] || {})
}

export function findMatchingPreset(mode, palette) {
  const normal = normalizePalette(palette, DEFAULT_PALETTES[mode])
  return availablePresets(mode).find((preset) =>
    PALETTE_KEYS.every((key) => paletteForPreset(mode, preset)[key] === normal[key])
  ) || 'custom'
}

/** Resolve System mode without ever changing either stored palette. */
export function resolvePaletteMode(mode, systemDark = false) {
  return mode === 'dark' || (mode === 'system' && systemDark) ? 'dark' : 'light'
}

/**
 * Normalize legacy persisted appearance state. Version 1 stored the same
 * palette keys but had no schema marker, so valid colours are safely retained;
 * missing or malformed values fall back field-by-field to Nova defaults.
 */
export function migrateAppearanceConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {}
  const lightPalette = normalizePalette(source.lightPalette, DEFAULT_PALETTES.light)
  const darkPalette = normalizePalette(source.darkPalette, DEFAULT_PALETTES.dark)

  return {
    appearanceVersion: APPEARANCE_SCHEMA_VERSION,
    lightPalette,
    darkPalette,
    lightThemePreset: findMatchingPreset('light', lightPalette),
    darkThemePreset: findMatchingPreset('dark', darkPalette),
  }
}

export function parseThemeImport(input) {
  let parsed
  try {
    parsed = typeof input === 'string' ? JSON.parse(input) : input
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null

  const light = normalizePalette(parsed.light, DEFAULT_PALETTES.light)
  const dark = normalizePalette(parsed.dark, DEFAULT_PALETTES.dark)
  const hasCompletePalette = (mode) => PALETTE_KEYS.every((key) => normalizeHex(parsed[mode]?.[key]))

  if (!hasCompletePalette('light') || !hasCompletePalette('dark')) return null

  return {
    light,
    dark,
    lightPreset: findMatchingPreset('light', light),
    darkPreset: findMatchingPreset('dark', dark),
  }
}

/** Blend `overlay` over `base`; `overlayRatio` is explicitly the overlay share. */
function blendHex(base, overlay, overlayRatio) {
  const parse = (hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
  const toHex = (value) => Math.round(value).toString(16).padStart(2, '0')
  const [r1, g1, b1] = parse(base)
  const [r2, g2, b2] = parse(overlay)
  return `#${toHex(r1 + (r2 - r1) * overlayRatio)}${toHex(g1 + (g2 - g1) * overlayRatio)}${toHex(b1 + (b2 - b1) * overlayRatio)}`.toUpperCase()
}

/** Apply the palette through shared root tokens; components never need per-view colours. */
export function applyPaletteTokens(root, palette, mode) {
  if (!root?.style) return
  const colors = normalizePalette(palette, DEFAULT_PALETTES[mode])
  const isDark = mode === 'dark'
  const white = '#FFFFFF'
  const black = '#000000'
  const surface = blendHex(colors.background, colors.surface, isDark ? .40 : .20)
  const surfaceMuted = blendHex(colors.background, colors.surface, isDark ? .18 : .10)
  // Keep Nova's previous readable metadata contrast: secondary text should
  // remain legible rather than inheriting an overly pale surface blend.
  const textSecondary = blendHex(colors.foreground, colors.background, .30)
  const textMuted = blendHex(colors.foreground, colors.background, isDark ? .57 : .43)
  const borderStrong = blendHex(colors.border, colors.foreground, isDark ? .24 : .14)
  const accentHover = blendHex(colors.accent, isDark ? white : black, isDark ? .10 : .15)
  const accentActive = blendHex(colors.accent, isDark ? white : black, isDark ? .20 : .27)
  const accentSubtle = blendHex(colors.background, colors.accent, isDark ? .22 : .10)
  const hover = blendHex(surface, colors.accent, isDark ? .08 : .045)

  const tokens = {
    // Semantic foundation. New code should consume these; legacy aliases below
    // keep existing Vue views on the same hierarchy during the transition.
    '--nm-bg': colors.background,
    '--nm-surface': surface,
    '--nm-surface-elevated': colors.surface,
    '--nm-text-primary': colors.foreground,
    '--nm-text-secondary': textSecondary,
    '--nm-text-muted': textMuted,
    '--nm-border': colors.border,
    '--nm-border-strong': borderStrong,
    '--nm-accent': colors.accent,
    '--nm-accent-hover': accentHover,
    '--nm-accent-active': accentActive,
    '--nm-accent-subtle': accentSubtle,
    '--nm-hover': hover,
    '--nm-selected': accentSubtle,
    '--nova-accent': colors.accent,
    '--nova-background': colors.background,
    '--nova-foreground': colors.foreground,
    '--nova-surface': colors.surface,
    '--nova-border': colors.border,
    '--nova-text-primary': colors.foreground,
    '--nova-text-secondary': textSecondary,
    '--nova-text-muted': textMuted,
    '--el-color-primary': colors.accent,
    '--el-color-primary-dark-2': accentHover,
    '--el-color-primary-light-3': blendHex(colors.accent, white, .30),
    '--el-color-primary-light-5': blendHex(colors.accent, white, .50),
    '--el-color-primary-light-7': blendHex(colors.accent, white, .70),
    '--el-color-primary-light-9': blendHex(colors.accent, white, .90),
    '--extra-light-fill': surfaceMuted,
    '--settings-page-background': colors.background,
    '--light-ill': blendHex(colors.surface, colors.border, .42),
    '--light-border': colors.border,
    '--dark-border': colors.border,
    '--base-fill': surfaceMuted,
    '--light-border-color': colors.border,
    '--aside-backgound': surface,
    '--aside-menu-active-background': accentSubtle,
    '--nova-surface-muted': surfaceMuted,
    '--nova-divider': colors.border,
    '--nova-search-bg': blendHex(colors.surface, colors.background, isDark ? .45 : .50),
    '--nova-hover': hover,
    '--nova-selected': accentSubtle,
    '--nova-button-hover': hover,
    '--nova-button-active': accentSubtle,
    '--nova-button-focus-ring': `0 0 0 2px ${blendHex(colors.background, colors.accent, isDark ? .52 : .42)}`,
    '--el-bg-color': colors.surface,
    '--el-bg-color-page': colors.background,
    '--el-fill-color': surfaceMuted,
    '--el-fill-color-light': blendHex(colors.surface, colors.background, .45),
    '--el-border-color': colors.border,
    '--el-border-color-light': blendHex(colors.border, colors.surface, .45),
    '--el-border-color-lighter': blendHex(colors.border, colors.surface, .65),
  }

  Object.entries(tokens).forEach(([name, value]) => root.style.setProperty(name, value))
}
