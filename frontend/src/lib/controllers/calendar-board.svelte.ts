import type { DndEvent } from 'svelte-dnd-action'
import { presses } from '../dnd/presses.action'
import { tappedItem } from '../dnd/tap'
import { isShadowItem } from '../dnd/zone-options'
import { groupByLabelView } from '../group-view.svelte'
import { dropKind } from '../tasks/drop'
import { buildBoard, type CellItem } from '../tasks/projection'
import type { Task } from '../types'
import { createDropList } from './drop-list.svelte'
import type { TaskCore } from './task-core.svelte'

export type CalendarBoard = ReturnType<typeof createCalendarBoard>

export function createCalendarBoard(
  core: TaskCore,
  keys: () => string[],
  open: (task: Task) => void,
) {
  const drop = createDropList(() =>
    buildBoard(core.tasks, keys(), groupByLabelView() ? core.labels : undefined),
  )
  let dropKey = $state<string | null>(null)

  function consider(key: string, e: CustomEvent<DndEvent<CellItem>>) {
    drop.consider(key, e.detail.items)
    // A tiny month cell hides the per-list ring under the finger, so mark the whole day.
    if (e.detail.items.some(isShadowItem)) dropKey = key
    else if (dropKey === key) dropKey = null
  }

  function finalize(key: string, e: CustomEvent<DndEvent<CellItem>>) {
    dropKey = null
    drop.finalize(key, e.detail.items)
    const tapped = tappedItem(e.detail, presses.stationary)
    if (tapped) {
      open(tapped.task)
      return
    }
    const plan = dropKind(e.detail, key, core.tasks)
    if (plan.kind === 'reorder') drop.settle(core.reorder(plan.ids))
    else if (plan.kind === 'move-occurrence')
      drop.settle(core.moveOccurrence(plan.taskId, plan.occurrenceDate, plan.newDate))
    else if (plan.kind === 'move') drop.settle(core.moveToDay(plan.movedId, key, plan.reorderIds))
  }

  return {
    get board() {
      return drop.lists
    },
    get dragging() {
      return drop.dragging
    },
    get dropKey() {
      return dropKey
    },
    consider,
    finalize,
  }
}
