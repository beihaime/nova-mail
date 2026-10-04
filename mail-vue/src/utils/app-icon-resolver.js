/**
 * Shared resolver for `AppIcon`.
 *
 * `AppIcon` is the app's shared icon component. Alongside ordinary UI icons it
 * also renders the application branding slots (`brand-app`, used by the sidebar
 * and the admin shell) and the header theme toggle, which are aliases for
 * theme-specific assets.
 *
 * The distinction matters: a change to a branding asset must never alter how an
 * ordinary UI icon (profile, security, accounts, delete, compose, navigation,
 * …) resolves. Keeping the name mapping in this plain module — instead of
 * inline in the component — makes that guarantee directly unit-testable without
 * mounting a component, Pinia or Element Plus.
 */

/** Directory (relative to the component) that the local SVG assets live in. */
export const APP_ICON_ASSET_DIR = '../../icons/svg'

/** Asset used when a name has no dedicated SVG, so a slot never renders blank. */
export const APP_ICON_FALLBACK_NAME = 'status-gray'

/**
 * Icons that already carry brand/status colours — they must not be inverted in
 * dark mode. This is a colour-rendering concern only; it does not change which
 * asset a name resolves to.
 */
export const PRESERVE_COLOR_ICONS = new Set([
  'add',
  'alert-action',
  'brand-app-dark',
  'brand-app-light',
  'brand-mark',
  'checkbox-checked',
  'checkbox-unchecked',
  'compose',
  'delete-action',
  'document-action',
  'download-action',
  'favorite-action',
  'flag-filled',
  'folder-action',
  'folder-blue',
  'folder-green',
  'folder-orange',
  'folder-purple',
  'folder-red',
  'folder-yellow',
  'inbox',
  'mail-action',
  'more-action',
  'profile-avatar',
  'send-action',
  'settings-action',
  'star-action',
  'star-filled',
  'status-blue',
  'status-gray',
  'status-green',
  'status-red',
  'status-yellow',
  'tag-action',
])

/**
 * Branding/theme aliases. Only these names are rewritten; every other name is
 * an ordinary UI icon and must be returned untouched.
 */
const BRAND_APP_ALIAS = { light: 'brand-app-light', dark: 'brand-app-dark' }
const THEME_TOGGLE_ALIAS = { light: 'theme-dark', dark: 'theme-light' }

/** True when `name` addresses an application branding slot. */
export function isBrandIconName(name) {
  return name === 'brand-app'
}

/**
 * Resolve an `AppIcon` `name` to the concrete asset name for the active theme.
 * Ordinary UI names pass through unchanged.
 */
export function resolveAppIconName(name, { dark = false } = {}) {
  if (name === 'brand-app') return dark ? BRAND_APP_ALIAS.dark : BRAND_APP_ALIAS.light
  // The toggle shows the theme the user can switch to.
  if (name === 'theme-toggle') return dark ? THEME_TOGGLE_ALIAS.dark : THEME_TOGGLE_ALIAS.light
  return name
}

/** Asset-map key for a concrete icon asset name. */
export function appIconAssetKey(name) {
  return `${APP_ICON_ASSET_DIR}/${name}.svg`
}

/** Whether the resolved asset keeps its own colours in dark mode. */
export function isPreservedIconColor(name) {
  return PRESERVE_COLOR_ICONS.has(name)
}

/**
 * Resolve the asset map entry for a name.
 *
 * @param {Record<string,string>} assets local `import.meta.glob` URL map
 * @returns {{name: string, key: string, src: string|undefined, preserveColor: boolean}}
 */
export function resolveAppIconAsset(assets, name, { dark = false, fallback = APP_ICON_FALLBACK_NAME } = {}) {
  const resolvedName = resolveAppIconName(name, { dark })
  return {
    name: resolvedName,
    key: appIconAssetKey(resolvedName),
    src: assets?.[appIconAssetKey(resolvedName)] || assets?.[appIconAssetKey(fallback)],
    preserveColor: isPreservedIconColor(resolvedName),
  }
}
