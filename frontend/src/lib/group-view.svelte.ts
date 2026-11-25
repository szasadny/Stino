import { GROUP_VIEW_STORAGE_KEY } from './constants'
import { readStored, writeStored } from './storage'

// Only an explicit '0' (List) opts out of the by-label default.
let grouped = $state(readStored(GROUP_VIEW_STORAGE_KEY) !== '0')

export function groupByLabelView(): boolean {
  return grouped
}

export function setGroupByLabelView(value: boolean): void {
  grouped = value
  writeStored(GROUP_VIEW_STORAGE_KEY, value ? '1' : '0')
}
