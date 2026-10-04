import { beforeAll, describe, expect, it } from 'vitest'
import { getIcon } from '@iconify/vue'

/**
 * Regression guard for the shared offline icon registry.
 *
 * The SPA ships with a strict Content-Security-Policy: `connect-src` allows
 * only the app origin and the Cloudflare challenge, so the Iconify runtime can
 * never reach `api.iconify.design` in production. Any ordinary UI icon that is
 * not registered locally therefore renders as an empty box while the container
 * (and the AppIcon branding assets) still look correct.
 *
 * These names are used by the settings, account-security, mailbox, admin and
 * login surfaces. They must resolve from the local bundle, independently of any
 * branding asset.
 */

// Reported regression: settings / account-security / compose.
const REPORTED_ICONS = [
  'solar:shield-check-linear', // Account & Security
  'solar:palette-linear', // Personalization
  'solar:info-circle-linear', // About
  'solar:user-circle-linear', // Profile
  'solar:letter-linear', // Account addresses
  'solar:link-linear', // Connected accounts
  'solar:devices-linear', // Device sessions
  'solar:trash-bin-trash-linear', // Delete Account
  'solar:pen-2-linear', // Compose FAB
]

// Shared chrome/actions that must stay local alongside them.
const OTHER_REQUIRED_ICONS = [
  'ion:ban-outline',
  'mdi:check',
  'mdi:reply-all-outline',
  'solar:add-circle-linear',
  'solar:alt-arrow-right-linear',
  'solar:arrow-left-linear',
  'solar:chart-2-linear',
  'solar:copy-linear',
  'solar:export-linear',
  'solar:forward-2-linear',
  'solar:forward-linear',
  'solar:hamburger-menu-linear',
  'solar:import-linear',
  'solar:inbox-linear',
  'solar:menu-dots-linear',
  'solar:paperclip-linear',
  'solar:play-linear',
  'solar:printer-linear',
  'solar:reply-linear',
  'solar:restart-linear',
  'solar:settings-linear',
  'solar:shield-user-linear',
  'solar:sort-vertical-linear',
  'solar:star-bold',
  'solar:star-linear',
  'solar:sun-2-linear',
  'solar:ticket-linear',
  'solar:users-group-rounded-linear',
]

// Icons that were already bundled before the regression: the fix must not come
// at the cost of dropping them.
const PRE_EXISTING_ICONS = [
  'solar:moon-linear',
  'solar:star-line-duotone',
  'eva:email-fill',
  'flat-color-icons:folder',
  'fluent:settings-24-filled',
  'mingcute:down-small-fill',
  'material-symbols-light:close-rounded',
  'fa7-solid:user-plus',
]

describe('local icon registry', () => {
  beforeAll(async () => {
    // Importing the registry performs the addCollection() calls. App.vue loads
    // the same module during boot.
    await import('@/icons/index.js')
  })

  it.each([...new Set([...REPORTED_ICONS, ...OTHER_REQUIRED_ICONS, ...PRE_EXISTING_ICONS])])(
    'resolves %s without the Iconify API',
    (name) => {
      expect(getIcon(name)).toBeTruthy()
    },
  )

  it('keeps every reported regression icon in the local bundle', () => {
    const unresolved = REPORTED_ICONS.filter((name) => !getIcon(name))
    expect(unresolved).toEqual([])
  })

  it('does not expose a partial icon body', () => {
    for (const name of REPORTED_ICONS) {
      const icon = getIcon(name)
      expect(typeof icon.body).toBe('string')
      expect(icon.body.length).toBeGreaterThan(0)
    }
  })
})
