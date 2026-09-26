import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A stand-in for the shared `<audio>` element.
 *
 * jsdom does not implement `HTMLMediaElement.play()`, and the point of these
 * tests is the outcome reporting around it, not the playback itself.
 */
function fakeAudio({ playRejects = null, readyState = 2 } = {}) {
  const listeners = {}

  return {
    readyState,
    paused: true,
    muted: false,
    volume: 1,
    currentTime: 0,
    error: null,
    _src: '',
    get src() { return this._src },
    set src(value) { this._src = value; this.currentSrc = value },
    currentSrc: '',
    getAttribute(name) { return name === 'src' ? this._src || null : null },
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler) },
    removeEventListener(type, handler) {
      listeners[type] = (listeners[type] || []).filter(item => item !== handler)
    },
    load() {},
    pause() {},
    play() {
      if (playRejects) return Promise.reject(playRejects)
      this.paused = false
      return Promise.resolve()
    },
  }
}

async function loadModule(audio) {
  vi.resetModules()
  vi.stubGlobal('Audio', function Audio() { return audio })
  vi.stubGlobal('window', globalThis.window)
  return await import('../src/utils/notificationSound.js')
}

describe('notification sound', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds the URL under the app base path', async () => {
    const sound = await loadModule(fakeAudio())

    expect(sound.notificationSoundUrl('flute')).toBe('/sounds/flute.wav')
    expect(sound.notificationSoundUrl('nope')).toBe(`/sounds/${sound.DEFAULT_NOTIFICATION_SOUND}.wav`)
  })

  it('falls back to the default for an unknown type', async () => {
    const sound = await loadModule(fakeAudio())

    expect(sound.normalizeSoundType('postive')).toBe('postive')
    expect(sound.normalizeSoundType('')).toBe(sound.DEFAULT_NOTIFICATION_SOUND)
    expect(sound.normalizeSoundType(undefined)).toBe(sound.DEFAULT_NOTIFICATION_SOUND)
  })

  it('plays and clears any previous failure', async () => {
    const sound = await loadModule(fakeAudio())

    await expect(sound.playNotificationSound('postive', { force: true })).resolves.toBe(true)
    expect(sound.notificationSoundStatus.lastError).toBe('')
    expect(sound.notificationSoundStatus.lastPlayedAt).toBeGreaterThan(0)
  })

  it('reports why a blocked playback produced no sound', async () => {
    const blocked = Object.assign(new Error('play() failed because the user did not interact'), {
      name: 'NotAllowedError',
    })
    const sound = await loadModule(fakeAudio({ playRejects: blocked }))

    await expect(sound.playNotificationSound('flute', { force: true })).resolves.toBe(false)

    // The settings page renders this, so a silent app explains itself.
    expect(sound.notificationSoundStatus.lastError).toContain('NotAllowedError')
    expect(sound.notificationSoundStatus.lastError).toMatch(/autoplay|playback/i)
  })

  it('reports a media element error instead of failing silently', async () => {
    const audio = fakeAudio()
    audio.error = { code: 4 }
    const sound = await loadModule(audio)

    await expect(sound.playNotificationSound('interface', { force: true })).resolves.toBe(false)
    expect(sound.notificationSoundStatus.lastError).toContain('MEDIA_ERR_SRC_NOT_SUPPORTED')
  })

  it('suppresses a repeat alert inside the anti-double-play window', async () => {
    const sound = await loadModule(fakeAudio())

    expect(await sound.playNotificationSound('interface')).toBe(true)
    expect(await sound.playNotificationSound('interface')).toBe(false)
    expect(await sound.playNotificationSound('interface', { force: true })).toBe(true)
  })

  it('retries once after a load-interrupted first attempt', async () => {
    const audio = fakeAudio()
    let attempts = 0
    audio.play = () => {
      attempts += 1
      if (attempts === 1) return Promise.reject(Object.assign(new Error('interrupted'), { name: 'AbortError' }))
      audio.paused = false
      return Promise.resolve()
    }
    // The retry waits for data; report it as already available.
    audio.readyState = 5

    const sound = await loadModule(audio)

    await expect(sound.playNotificationSound('flute', { force: true })).resolves.toBe(true)
    expect(attempts).toBe(2)
    expect(sound.notificationSoundStatus.lastError).toBe('')
  })

  it('does not retry a blocked autoplay request', async () => {
    const audio = fakeAudio()
    let attempts = 0
    audio.play = () => {
      attempts += 1
      return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
    }

    const sound = await loadModule(audio)

    await expect(sound.playNotificationSound('flute', { force: true })).resolves.toBe(false)
    expect(attempts).toBe(1)
  })
})
