export type ThemePref = 'system' | 'light' | 'dark'

// Mirror this key in the index.html bootstrap script if it ever changes.
export const THEME_STORAGE_KEY = 'stino-theme'

export const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function normalizeThemePref(value: unknown): ThemePref {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function getThemePref(): ThemePref {
  try {
    return normalizeThemePref(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

/** System removes `data-theme` so app.css's prefers-color-scheme rules take over. */
export function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'system') {
    delete root.dataset.theme
  } else {
    root.dataset.theme = pref
  }
}

export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // Storage may be unavailable (private mode); the choice still applies this session.
  }
  applyThemePref(pref)
}
