import { THEME_STORAGE_KEY } from './constants'
import { readStored, writeStored } from './storage'
import type { ThemePref } from './types'

function normalizeThemePref(value: unknown): ThemePref {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function getThemePref(): ThemePref {
  return normalizeThemePref(readStored(THEME_STORAGE_KEY))
}

// System removes `data-theme` so app.css's prefers-color-scheme rules take over.
function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'system') {
    delete root.dataset.theme
  } else {
    root.dataset.theme = pref
  }
}

export function setThemePref(pref: ThemePref): void {
  writeStored(THEME_STORAGE_KEY, pref)
  applyThemePref(pref)
}
