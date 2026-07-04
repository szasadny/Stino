// The day-selection layer shared by the Month and Week views: the id→label
// lookup and per-day task index every calendar grid needs, plus the "which day
// is zoomed" state that drives the day sheet. Instantiate at component-init so
// its deriveds attach to that view's lifecycle. Pairs with `createCalendarBoard`
// (drag) and `createTaskCore` (CRUD) — each view binds to all three instead of
// re-deriving this block.
import { toISODate } from '../date'
import { groupByDate } from '../grouping'
import { labelLookup } from '../labels'
import type { TaskCore } from './task-core.svelte'

export function createCalendarSelection(core: TaskCore) {
  const labelFor = $derived(labelLookup(core.labels))
  const tasksByDate = $derived(groupByDate(core.tasks))
  let selectedDate = $state<Date | null>(null)
  // The tapped day's tasks, keyed off the per-day index — `[]` while nothing is
  // selected or the day is empty.
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
