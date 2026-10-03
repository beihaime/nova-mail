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
    terracotta: {
      accent: '#DA7756', background: '#F5F3EE', foreground: '#1D1B16', surface: '#FFFCF8', border: '#D8D3CA',
    },
    forest: {
      accent: '#4F8A65', background: '#F3F6F1', foreground: '#182219', surface: '#FBFDF9', border: '#D2DCD0',
    },
    lavender: {
      accent: '#C86478', background: '#FAF4F5', foreground: '#2B1C20', surface: '#FFFDFD', border: '#E5D2D6',
    },
    matcha: {
      accent: '#789262', background: '#F5F6EE', foreground: '#20251A', surface: '#FCFDF7', border: '#D8DDC9',
    },
    graphite: {
      accent: '#666B73', background: '#F4F4F3', foreground: '#1C1D1F', surface: '#FCFCFB', border: '#D7D7D4',
    },
    sakura: {
      accent: '#D77A96', background: '#FCF5F7', foreground: '#2A1D22', surface: '#FFFCFD', border: '#E8D5DB',
    },
    arctic: {
      accent: '#4C91A8', background: '#F2F7F8', foreground: '#172326', surface: '#FAFEFF', border: '#CFDEE1',
    },
    mocha: {
      accent: '#9A7058', background: '#F7F2ED', foreground: '#291F1A', surface: '#FFFDF9', border: '#DFD2C8',
    },
    amber: {
      accent: '#D99024', background: '#FFF8E8', foreground: '#2B2114', surface: '#FFFCF4', border: '#E6D7B8',
    },
    aurora: {
      accent: '#269C91', background: '#F1F8F7', foreground: '#152523', surface: '#FBFEFD', border: '#CFE1DE',
    },
    cobalt: {
      accent: '#3568D4', background: '#F3F6FC', foreground: '#182033', surface: '#FCFDFF', border: '#D2DAEA',
    },
    orchid: {
      accent: '#9964B4', background: '#F8F4FA', foreground: '#281D2D', surface: '#FFFDFE', border: '#E1D3E6',
    },
    crimson: {
      accent: '#B64F5C', background: '#FAF4F4', foreground: '#2B191C', surface: '#FFFDFD', border: '#E4D1D3',
    },
    pine: {
      accent: '#39745D', background: '#F2F6F3', foreground: '#18231E', surface: '#FBFDFB', border: '#CFDBD4',
    },
    lunar: {
      accent: '#697386', background: '#F5F6F8', foreground: '#1C2027', surface: '#FFFFFF', border: '#D8DCE2',
    },
    cyber: {
      accent: '#1689A7', background: '#F0F8FA', foreground: '#14252A', surface: '#FAFEFF', border: '#C9E0E5',
    },
  },
  dark: {
    'nova-default': DEFAULT_PALETTES.dark,
    terracotta: {
      accent: '#DA7756', background: '#171512', foreground: '#F5F1EA', surface: '#211E1A', border: '#3A3530',
    },
    forest: {
      accent: '#70A984', background: '#131813', foreground: '#EDF3EC', surface: '#1C241D', border: '#354137',
    },
    lavender: {
      accent: '#DF7C90', background: '#1A1416', foreground: '#FAEFF1', surface: '#251C1F', border: '#48353B',
    },
    matcha: {
      accent: '#9AAF7B', background: '#161811', foreground: '#F1F3E9', surface: '#20241A', border: '#3A4030',
    },
    graphite: {
      accent: '#A8ADB5', background: '#141516', foreground: '#F1F1F0', surface: '#1E2022', border: '#393C40',
    },
    sakura: {
      accent: '#E896AD', background: '#1B1417', foreground: '#FAF0F3', surface: '#271D21', border: '#49373D',
    },
    arctic: {
      accent: '#6FB1C5', background: '#111719', foreground: '#EDF6F7', surface: '#192326', border: '#314247',
    },
    mocha: {
      accent: '#BC8C70', background: '#181411', foreground: '#F5EEE8', surface: '#231D19', border: '#40362F',
    },
    amber: {
      accent: '#F0B44D', background: '#17130B', foreground: '#F8EFD8', surface: '#211B10', border: '#423722',
    },
    aurora: {
      accent: '#4BC2B5', background: '#0F1716', foreground: '#EAF6F4', surface: '#172220', border: '#30423F',
    },
    cobalt: {
      accent: '#6891EF', background: '#10141D', foreground: '#EDF1FA', surface: '#181E2A', border: '#313B50',
    },
    orchid: {
      accent: '#B985D2', background: '#18131B', foreground: '#F6EEF8', surface: '#231B27', border: '#403346',
    },
    crimson: {
      accent: '#D66B77', background: '#1A1214', foreground: '#F9EFF0', surface: '#25191C', border: '#493238',
    },
    pine: {
      accent: '#62A486', background: '#101713', foreground: '#ECF4EF', surface: '#18231D', border: '#304238',
    },
    lunar: {
      accent: '#9CA7BA', background: '#111318', foreground: '#F0F2F5', surface: '#1A1D23', border: '#343943',
    },
    cyber: {
      accent: '#2EC4E6', background: '#0C1417', foreground: '#E8F7FA', surface: '#132025', border: '#29414A',
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

function persistedPresetForPalette(mode, palette, persistedPreset) {
  const preset = String(persistedPreset || '')
  const normal = normalizePalette(palette, DEFAULT_PALETTES[mode])
  if (
    availablePresets(mode).includes(preset)
    && PALETTE_KEYS.every((key) => paletteForPreset(mode, preset)[key] === normal[key])
  ) {
    return preset
  }
  return findMatchingPreset(mode, normal)
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
    lightThemePreset: persistedPresetForPalette('light', lightPalette, source.lightThemePreset),
    darkThemePreset: persistedPresetForPalette('dark', darkPalette, source.darkThemePreset),
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
  // Status colours are semantic rather than preset inputs: they retain clear
  // meaning across a user-selected palette while adapting luminance for each
  // appearance mode.
  const danger = isDark ? '#B84D47' : '#C73C3C'
  const dangerHover = isDark ? '#A83F3A' : '#AD3030'
  const dangerActive = isDark ? '#943531' : '#922727'
  const dangerSurface = blendHex(colors.background, danger, isDark ? .16 : .08)
  const dangerBorder = blendHex(colors.border, danger, isDark ? .42 : .50)
  const warning = isDark ? '#E3B341' : '#A86E00'
  const success = isDark ? '#56D364' : '#20824D'

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
    '--nm-danger': danger,
    '--nm-danger-hover': dangerHover,
    '--nm-danger-active': dangerActive,
    '--nm-danger-foreground': '#FFFFFF',
    '--nm-danger-surface': dangerSurface,
    '--nm-danger-border': dangerBorder,
    '--nova-danger': danger,
    '--nova-warning': warning,
    '--nova-success': success,
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
