import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEME_OPTIONS, THEME_STORAGE_KEY } from './constants'
import { getThemePref } from './theme'

const storing = (value: string | null) => ({
  getItem: (key: string) => (key === THEME_STORAGE_KEY ? value : null),
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getThemePref', () => {
  it.each(['light', 'dark', 'system'])('keeps the stored "%s" preference', (pref) => {
    vi.stubGlobal('localStorage', storing(pref))
    expect(getThemePref()).toBe(pref)
  })

  it.each([null, 'bogus'])('falls back to system for %j', (stored) => {
    vi.stubGlobal('localStorage', storing(stored))
    expect(getThemePref()).toBe('system')
  })

  it('falls back to system when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(getThemePref()).toBe('system')
  })
})

describe('theme options', () => {
  it('offers system, light and dark', () => {
    expect(THEME_OPTIONS.map((o) => o.value)).toEqual(['system', 'light', 'dark'])
  })
})
