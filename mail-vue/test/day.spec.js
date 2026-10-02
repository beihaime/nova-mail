import { beforeAll, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

let formatListClock
let useSettingStore
let settingStore

beforeAll(async () => {
  setActivePinia(createPinia())
  ;({ formatListClock } = await import('../src/utils/day.js'))
  ;({ useSettingStore } = await import('../src/store/setting.js'))
  settingStore = useSettingStore()
})

describe('formatListClock', () => {
  it('keeps the day in Chinese labels for earlier mail in the current year', () => {
    settingStore.lang = 'zh'
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    expect(formatListClock(yesterday)).toMatch(/^\d{1,2}月\d{1,2}日$/)
  })

  it('keeps the English compact date in the English interface', () => {
    settingStore.lang = 'en'
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    expect(formatListClock(yesterday)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/)
  })
})
