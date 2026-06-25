import { describe, expect, it } from 'vitest'
import { normalizeThemePref, THEME_OPTIONS } from './theme'

describe('normalizeThemePref', () => {
  it('keeps the valid preferences', () => {
    expect(normalizeThemePref('light')).toBe('light')
    expect(normalizeThemePref('dark')).toBe('dark')
    expect(normalizeThemePref('system')).toBe('system')
  })

  it('falls back to system for anything else', () => {
    expect(normalizeThemePref(null)).toBe('system')
    expect(normalizeThemePref(undefined)).toBe('system')
    expect(normalizeThemePref('bogus')).toBe('system')
  })
})

describe('THEME_OPTIONS', () => {
  it('offers system, light and dark', () => {
    expect(THEME_OPTIONS.map((o) => o.value)).toEqual(['system', 'light', 'dark'])
  })
})
