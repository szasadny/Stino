// Grid drop zones over TaskCore. Instantiate at component init so the effect follows the view.
import { untrack } from 'svelte'
import { SHADOW_ITEM_MARKER_PROPERTY_NAME, type DndEvent } from 'svelte-dnd-action'
import { api } from '../api'
import { buildBoard, type CellItem } from '../calendar-board'
import { groupByLabelView } from '../group-view.svelte'
import { applyMove, dropKind } from '../move'
import type { TaskCore } from './task-core.svelte'

export function createCalendarBoard(
  core: TaskCore,
  keys: () => string[],
  reload: () => Promise<void>,
) {
  let board = $state<Record<string, CellItem[]>>({})
  let dragging = $state(false)
  let dropKey = $state<string | null>(null)

  // Never re-project while dnd owns an in-flight list.
  $effect(() => {
    const next = buildBoard(core.tasks, keys(), groupByLabelView() ? core.labels : undefined)
    if (untrack(() => dragging)) return
    board = next
  })

  function consider(key: string, e: CustomEvent<DndEvent<CellItem>>) {
    dragging = true
    board[key] = e.detail.items
    // A tiny month cell hides the per-list ring under the finger, so mark the whole day.
    const hasShadow = e.detail.items.some((it) => SHADOW_ITEM_MARKER_PROPERTY_NAME in it)
    if (hasShadow) dropKey = key
    else if (dropKey === key) dropKey = null
  }

  function finalize(key: string, e: CustomEvent<DndEvent<CellItem>>) {
    dropKey = null
    board[key] = e.detail.items
    dragging = false // before persisting, so the optimistic update can re-project
    const plan = dropKind(e, key, core.tasks)
    if (plan.kind === 'none') return
    if (plan.kind === 'reorder') {
      void core.reorder(plan.ids)
      return
    }
    if (plan.kind === 'move-occurrence') {
      void core.save(
        () =>
          api.tasks.moveOccurrence(plan.taskId, plan.occurrenceDate, plan.newDate).then(() => {}),
        reload,
        'Could not move the occurrence',
      )
      return
    }
    void core.optimistic(
      () => {
        core.tasks = applyMove(core.tasks, plan.movedId, key)
      },
      async () => {
        await api.tasks.update(plan.movedId, { due_date: key })
        if (!plan.reorderIds) return
        try {
          await api.tasks.reorder(plan.reorderIds)
        } catch (err) {
          // The date write landed: reload so the revert can't put it back on the old day.
          void reload()
          throw err
        }
      },
      'Could not move the task',
    )
  }

  return {
    get board() {
      return board
    },
    get dragging() {
      return dragging
    },
    get dropKey() {
      return dropKey
    },
    consider,
    finalize,
  }
}
