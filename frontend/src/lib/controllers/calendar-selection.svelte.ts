import { toISODate } from '../date'
import { groupByDate } from '../grouping'
import { labelLookup } from '../labels'
import type { TaskCore } from './task-core.svelte'

export function createCalendarSelection(core: TaskCore) {
  const labelFor = $derived(labelLookup(core.labels))
  const tasksByDate = $derived(groupByDate(core.tasks))
  let selectedDate = $state<Date | null>(null)
  const selectedTasks = $derived(
    selectedDate ? (tasksByDate.get(toISODate(selectedDate)) ?? []) : [],
  )

  return {
    get labelFor() {
      return labelFor
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
