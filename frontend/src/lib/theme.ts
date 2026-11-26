import { THEME_STORAGE_KEY } from './constants'
import { readStored, writeStored } from './storage'
import type { ThemePref } from './types'

function normalizeThemePref(value: unknown): ThemePref {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function getThemePref(): ThemePref {
  return normalizeThemePref(readStored(THEME_STORAGE_KEY))
}

// An explicit theme must also win the browser chrome, which only reads the meta that matches.
export function themeColorMedia(pref: ThemePref, scheme: string): string {
  if (pref === 'system') return `(prefers-color-scheme: ${scheme})`
  return pref === scheme ? 'all' : 'not all'
}

// System removes `data-theme` so app.css's prefers-color-scheme rules take over.
function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'system') {
    delete root.dataset.theme
  } else {
    root.dataset.theme = pref
  }
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (meta.dataset.scheme) meta.media = themeColorMedia(pref, meta.dataset.scheme)
  }
}

export function setThemePref(pref: ThemePref): void {
  writeStored(THEME_STORAGE_KEY, pref)
  applyThemePref(pref)
}
