// Shared Month/Week day selection, label lookup, and per-day task index.
import { toISODate } from '../date'
import { groupByDate } from '../grouping'
import { labelLookup } from '../labels'
import type { TaskCore } from './task-core.svelte'

export function createCalendarSelection(core: TaskCore) {
  const labelFor = $derived(labelLookup(core.labels))
  const tasksByDate = $derived(groupByDate(core.tasks))
  let selectedDate = $state<Date | null>(null)
  // Selected day's tasks, or [] when no day is selected/empty.
  const selectedTasks = $derived(
    selectedDate ? (tasksByDate.get(toISODate(selectedDate)) ?? []) : [],
  )

  return {
    get labelFor() {
      return labelFor
    },
    get tasksByDate() {
      return tasksByDate
    },
    get selectedDate() {
      return selectedDate
    },
    set selectedDate(value: Date | null) {
      selectedDate = value
    },
    get selectedTasks() {
      return selectedTasks
    },
  }
}
