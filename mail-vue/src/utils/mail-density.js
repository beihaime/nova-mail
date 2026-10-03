export const MAIL_DENSITY_GEOMETRY = Object.freeze({
  normal: Object.freeze({ desktop: 48, phone: 80, phoneOther: 83 }),
  compact: Object.freeze({ desktop: 42, phone: 68, phoneOther: 72 }),
})

export function normalizeMailDensity(value) {
  return value === 'compact' ? 'compact' : 'normal'
}

export async function loadMailDensity(settingStore) {
  // The preference belongs to the authenticated user, never to a previous
  // browser-local session. Keep the default while the request is in flight.
  settingStore.mailListDensity = 'normal'
  try {
    const { getMailPreferences } = await import('@/request/preferences.js')
    const preferences = await getMailPreferences()
    settingStore.mailListDensity = normalizeMailDensity(preferences?.mailListDensity)
  } catch (error) {
    console.error('Nova Mail: unable to load mail list density', error)
  }
}
