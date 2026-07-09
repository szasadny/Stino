// Whether a day's tasks are ordered by label (the DEFAULT) or shown in the flat,
// drag-sorted order — timed-first, then the one manual `sort_order` every view
// shares (see lib/ordering.ts). This ONE preference drives every surface: the
// month/week board projection (createCalendarBoard → buildBoard's label ordering)
// and the day agendas (Today, phone day sheet), so all views flip together. The
// flat List order remains available via the toggle (DayAgenda) or Settings.
//
// Module-level reactive state (like lib/viewport.svelte.ts), persisted to
// localStorage like the theme so the choice survives a reload. Client-only SPA,
// so reading storage at import time is safe. Exported through functions because
// a reassigned `let` can't be exported as live reactive state.

// Mirror this key if it ever changes; no other reader depends on the exact string.
const STORAGE_KEY = 'stino-day-grouping'

function read(): boolean {
  try {
    // Anything but an explicit '0' (a stored List choice) means the label default.
    return localStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

let grouped = $state(read())

/** True (default) ⇒ order a day's tasks by label; false ⇒ the flat drag-sorted list. */
export function groupByLabelView(): boolean {
  return grouped
}

/** Set the preference and persist it (best-effort; storage may be unavailable). */
export function setGroupByLabelView(value: boolean): void {
  grouped = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Private mode etc. — the choice still applies for this session in memory.
  }
}
