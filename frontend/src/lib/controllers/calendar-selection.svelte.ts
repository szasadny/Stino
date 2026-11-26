import type { Attachment } from 'svelte/attachments'
import { toISODate } from '../date'
import type { FocusTarget } from '../dnd/focus-return.action'
import type { TaskCore } from './task-core.svelte'

export type CalendarSelection = ReturnType<typeof createCalendarSelection>

export function createCalendarSelection(core: TaskCore) {
  let selectedDate = $state<Date | null>(null)
  const selectedKey = $derived(selectedDate ? toISODate(selectedDate) : null)
  const selectedTasks = $derived(
    selectedKey ? core.tasks.filter((t) => t.occurrence_date === selectedKey) : [],
  )

  // The open day's cell registers itself; once it unmounts the last rect stays, so the zoom stays put.
  let anchor: HTMLElement | null = null
  let anchorRect = $state.raw<DOMRect | null>(null)

  // Never cleared: the open day's cell can tear down before the closing zoom reads it.
  let dayButton: FocusTarget | null = null
  const markDayButton: Attachment<FocusTarget> = (button) => {
    dayButton = button
  }

  const anchorTo: Attachment<HTMLElement> = (cell) => {
    anchor = cell
    anchorRect = cell.getBoundingClientRect()
    return () => {
      if (anchor === cell) anchor = null
    }
  }

  return {
    get selectedDate() {
      return selectedDate
    },
    get selectedKey() {
      return selectedKey
    },
    get selectedTasks() {
      return selectedTasks
    },
    get anchorRect() {
      return anchorRect
    },
    get dayButton() {
      return dayButton
    },
    select(date: Date): void {
      selectedDate = date
    },
    clear(): void {
      selectedDate = null
      anchorRect = null
    },
    anchorTo,
    markDayButton,
    remeasure(): void {
      if (anchor) anchorRect = anchor.getBoundingClientRect()
    },
  }
}
