// Whether a day's task list is grouped into label sections (an alternative view)
// or shows the default flat, drag-sorted order — timed-first, then the one manual
// `sort_order` every view shares (see lib/ordering.ts). Flat is the DEFAULT so a
// day zoom reads the same top-to-bottom sequence as the month/week cells it opened
// from, and Today matches too; the label grouping is opt-in behind a toggle.
//
// Module-level reactive state (like lib/viewport.svelte.ts) so Today and the phone
// day sheet share ONE preference and flip together, persisted to localStorage like
// the theme so the choice survives a reload. Client-only SPA, so reading storage at
// import time is safe. Exported through functions because a reassigned `let` can't
// be exported as live reactive state.

// Mirror this key if it ever changes; no other reader depends on the exact string.
const STORAGE_KEY = 'stino-day-grouping'

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

let grouped = $state(read())

/** True ⇒ group a day's tasks by label; false (default) ⇒ the flat drag-sorted list. */
export function groupByLabelView(): boolean {
  return grouped
}

/** Flip the preference and persist it (best-effort; storage may be unavailable). */
export function toggleGroupByLabelView(): void {
  grouped = !grouped
  try {
    localStorage.setItem(STORAGE_KEY, grouped ? '1' : '0')
  } catch {
    // Private mode etc. — the choice still applies for this session in memory.
  }
}
