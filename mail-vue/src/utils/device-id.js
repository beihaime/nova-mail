const DEVICE_ID_KEY = 'nova-device-id'

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || [...globalThis.crypto.getRandomValues(new Uint8Array(16))].map((value) => value.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export function isInstalledPwa() {
  return Boolean(globalThis.matchMedia?.('(display-mode: standalone)').matches || globalThis.navigator?.standalone)
}
