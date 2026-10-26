const STORAGE_KEY = 'stino-day-grouping'

function read(): boolean {
  try {
    // Only an explicit '0' (List) opts out of the by-label default.
    return localStorage.getItem(STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

let grouped = $state(read())

export function groupByLabelView(): boolean {
  return grouped
}

export function setGroupByLabelView(value: boolean): void {
  grouped = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Storage may be unavailable (private mode); the choice still applies this session.
  }
}
