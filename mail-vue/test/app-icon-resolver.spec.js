import { describe, expect, it } from 'vitest'

import {
  APP_ICON_FALLBACK_NAME,
  PRESERVE_COLOR_ICONS,
  appIconAssetKey,
  isBrandIconName,
  isPreservedIconColor,
  resolveAppIconAsset,
  resolveAppIconName,
} from '@/utils/app-icon-resolver.js'

/**
 * Regression guard for the shared AppIcon resolver.
 *
 * Application branding (`brand-app`) and the header theme toggle are aliases
 * for theme-specific assets. Every other name is an ordinary UI icon — the
 * profile/security/accounts/delete/compose/navigation glyphs — and must pass
 * through untouched. A branding edit must never be able to redirect those
 * names, so this module is the single place the mapping lives.
 */

const UI_ICON_NAMES = [
  'profile-avatar',
  'settings-action',
  'delete-action',
  'compose',
  'add',
  'refresh',
  'checkbox-checked',
  'nova-sidebar-inbox',
  'nova-sidebar-settings',
]

describe('resolveAppIconName', () => {
  it('maps the branding slot to its light/dark asset', () => {
    expect(resolveAppIconName('brand-app', { dark: false })).toBe('brand-app-light')
    expect(resolveAppIconName('brand-app', { dark: true })).toBe('brand-app-dark')
  })

  it('maps the theme toggle to the theme the user can switch to', () => {
    expect(resolveAppIconName('theme-toggle', { dark: false })).toBe('theme-dark')
    expect(resolveAppIconName('theme-toggle', { dark: true })).toBe('theme-light')
  })

  it.each(UI_ICON_NAMES)('leaves the ordinary UI icon %s untouched', (name) => {
    expect(resolveAppIconName(name, { dark: false })).toBe(name)
    expect(resolveAppIconName(name, { dark: true })).toBe(name)
  })

  it('only treats brand-app as a branding slot', () => {
    expect(isBrandIconName('brand-app')).toBe(true)
    for (const name of UI_ICON_NAMES) expect(isBrandIconName(name)).toBe(false)
  })
})

describe('resolveAppIconAsset', () => {
  const assets = {
    [appIconAssetKey('brand-app-light')]: '/assets/brand-app-light.svg',
    [appIconAssetKey('brand-app-dark')]: '/assets/brand-app-dark.svg',
    [appIconAssetKey('theme-dark')]: '/assets/theme-dark.svg',
    [appIconAssetKey('theme-light')]: '/assets/theme-light.svg',
    [appIconAssetKey('profile-avatar')]: '/assets/profile-avatar.svg',
    [appIconAssetKey('compose')]: '/assets/compose.svg',
    [appIconAssetKey(APP_ICON_FALLBACK_NAME)]: '/assets/status-gray.svg',
  }

  it.each(['profile-avatar', 'compose'])('resolves the UI icon %s locally', (name) => {
    expect(resolveAppIconAsset(assets, name, { dark: true }).src).toBe(assets[appIconAssetKey(name)])
  })

  it('still resolves an ordinary icon when branding assets change', () => {
    // Simulate a branding cleanup that renames/removes the Nova brand assets.
    const withoutBrand = { ...assets }
    delete withoutBrand[appIconAssetKey('brand-app-light')]
    delete withoutBrand[appIconAssetKey('brand-app-dark')]

    const resolved = resolveAppIconAsset(withoutBrand, 'profile-avatar', { dark: true })
    expect(resolved.name).toBe('profile-avatar')
    expect(resolved.src).toBe(withoutBrand[appIconAssetKey('profile-avatar')])
  })

  it('resolves the branding slot to the active theme asset', () => {
    expect(resolveAppIconAsset(assets, 'brand-app', { dark: true }).src).toBe(assets[appIconAssetKey('brand-app-dark')])
    expect(resolveAppIconAsset(assets, 'brand-app', { dark: false }).src).toBe(assets[appIconAssetKey('brand-app-light')])
  })

  it('falls back to a local neutral glyph, never to a branding asset', () => {
    const resolved = resolveAppIconAsset(assets, 'does-not-exist', { dark: false })
    expect(resolved.src).toBe(assets[appIconAssetKey(APP_ICON_FALLBACK_NAME)])
    expect(resolved.preserveColor).toBe(false)
  })

  it('flags preserved-colour UI icons without rewriting their name', () => {
    expect(isPreservedIconColor('compose')).toBe(true)
    expect(isPreservedIconColor('brand-app-light')).toBe(true)
    expect(isPreservedIconColor('profile-avatar')).toBe(true)
    expect(isPreservedIconColor('nova-sidebar-inbox')).toBe(false)
    expect(PRESERVE_COLOR_ICONS.has('brand-mark')).toBe(true)
  })
})
