export const PALETTE_KEYS = ['accent', 'background', 'foreground', 'surface', 'border']

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

function mixHex(first, second, amount) {
  const parse = (hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
  const toHex = (value) => Math.round(value).toString(16).padStart(2, '0')
  const [r1, g1, b1] = parse(first)
  const [r2, g2, b2] = parse(second)
  return `#${toHex(r1 + (r2 - r1) * amount)}${toHex(g1 + (g2 - g1) * amount)}${toHex(b1 + (b2 - b1) * amount)}`.toUpperCase()
}

/** Apply the palette through shared root tokens; components never need per-view colours. */
export function applyPaletteTokens(root, palette, mode) {
  if (!root?.style) return
  const colors = normalizePalette(palette, DEFAULT_PALETTES[mode])
  const isDark = mode === 'dark'
  const white = '#FFFFFF'
  const black = '#000000'
  const textSecondary = mixHex(colors.foreground, colors.background, isDark ? .35 : .30)
  const textMuted = mixHex(colors.foreground, colors.background, isDark ? .52 : .48)
  const surfaceMuted = mixHex(colors.surface, colors.background, isDark ? .52 : .64)

  const tokens = {
    '--nova-accent': colors.accent,
    '--nova-background': colors.background,
    '--nova-foreground': colors.foreground,
    '--nova-surface': colors.surface,
    '--nova-border': colors.border,
    '--nova-text-primary': colors.foreground,
    '--nova-text-secondary': textSecondary,
    '--nova-text-muted': textMuted,
    '--el-color-primary': colors.accent,
    '--el-color-primary-dark-2': mixHex(colors.accent, black, .18),
    '--el-color-primary-light-3': mixHex(colors.accent, white, .30),
    '--el-color-primary-light-5': mixHex(colors.accent, white, .50),
    '--el-color-primary-light-7': mixHex(colors.accent, white, .70),
    '--el-color-primary-light-9': mixHex(colors.accent, white, .90),
    '--extra-light-fill': surfaceMuted,
    '--settings-page-background': colors.background,
    '--light-ill': mixHex(colors.surface, colors.border, .42),
    '--light-border': colors.border,
    '--dark-border': colors.border,
    '--base-fill': surfaceMuted,
    '--light-border-color': colors.border,
    '--aside-backgound': colors.surface,
    '--aside-menu-active-background': mixHex(colors.accent, colors.background, isDark ? .22 : .12),
    '--nova-surface-muted': surfaceMuted,
    '--nova-divider': colors.border,
    '--nova-search-bg': mixHex(colors.surface, colors.background, isDark ? .65 : .55),
    '--nova-hover': mixHex(colors.accent, colors.surface, isDark ? .10 : .06),
    '--nova-selected': mixHex(colors.accent, colors.background, isDark ? .26 : .10),
    '--el-bg-color': colors.surface,
    '--el-bg-color-page': colors.background,
    '--el-fill-color': surfaceMuted,
    '--el-fill-color-light': mixHex(colors.surface, colors.background, .45),
    '--el-border-color': colors.border,
    '--el-border-color-light': mixHex(colors.border, colors.surface, .45),
    '--el-border-color-lighter': mixHex(colors.border, colors.surface, .65),
  }

  Object.entries(tokens).forEach(([name, value]) => root.style.setProperty(name, value))
}

