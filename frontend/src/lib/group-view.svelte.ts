// Shared persisted preference for label-grouped vs flat day ordering.

// Keep this key aligned with any other readers.
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
