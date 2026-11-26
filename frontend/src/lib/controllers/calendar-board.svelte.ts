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
  const labelOrder = () => (groupByLabelView() ? core.labels : undefined)
  const drop = createDropList(() => buildBoard(core.tasks, keys(), labelOrder()))
  let dropKey = $state<string | null>(null)

  function consider(key: string, e: CustomEvent<DndEvent<CellItem>>) {
    drop.consider(key, e.detail)
    // A tiny month cell hides the per-list ring under the finger, so mark the whole day.
    if (e.detail.items.some(isShadowItem)) dropKey = key
    else if (dropKey === key) dropKey = null
  }

  function write(key: string, detail: DndEvent<CellItem>): Promise<boolean> | undefined {
    const plan = dropKind(detail, key, core.tasks, labelOrder())
    if (plan.kind === 'reorder') return core.reorder(plan.ids)
    if (plan.kind === 'move-occurrence')
      return core.moveOccurrence(plan.taskId, plan.occurrenceDate, plan.newDate)
    if (plan.kind === 'move') return core.moveToDay(plan.movedId, key, plan.reorderIds)
    return undefined
  }

  function finalize(key: string, e: CustomEvent<DndEvent<CellItem>>) {
    dropKey = null
    drop.finalize(key, e.detail, () => {
      const tapped = tappedItem(e.detail, presses.stationary)
      if (!tapped) return write(key, e.detail)
      open(tapped.task)
      return undefined
    })
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
