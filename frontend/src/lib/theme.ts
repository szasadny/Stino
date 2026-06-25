// Theme preference. "System" follows the OS (prefers-color-scheme); "Light" /
// "Dark" are manual overrides that win over the OS. The choice persists in
// localStorage and is reflected as a `data-theme` attribute on <html> that the
// CSS variables key off (see app.css). A tiny inline bootstrap in index.html
// applies a saved override before first paint so there's no flash.

export type ThemePref = 'system' | 'light' | 'dark'

// Mirror this key in the index.html bootstrap script if it ever changes.
export const THEME_STORAGE_KEY = 'stino-theme'

export const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** Narrow an unknown stored value to a valid preference (System by default). */
export function normalizeThemePref(value: unknown): ThemePref {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/** The saved preference, or System when none is stored / storage is unavailable. */
export function getThemePref(): ThemePref {
  try {
    return normalizeThemePref(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

/** Reflect a preference on <html>: a manual override sets `data-theme`; System
 *  removes it so the prefers-color-scheme rules in app.css take over. */
export function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'system') {
    delete root.dataset.theme
  } else {
    root.dataset.theme = pref
  }
}

/** Persist and apply a preference. */
export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // Storage may be unavailable (private mode); the choice still applies for
    // this session via applyThemePref.
  }
  applyThemePref(pref)
}
