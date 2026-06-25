// The month/week drop-zone layer on top of a TaskCore: one mutable CellItem[] per day,
// projected from the core's tasks, plus the drag handlers. A grid drag MOVES a task to
// another day (see move.ts) — within-day order is owned by the day view. Instantiate at
// component-init in Month/Week so its $effect attaches to that view's lifecycle.
import { untrack } from 'svelte'
import { type DndEvent } from 'svelte-dnd-action'
import { api } from '../api'
import { buildBoard, type CellItem } from '../calendar-board'
import { applyMove, dropKind } from '../move'
import type { TaskCore } from './task-core.svelte'

export function createCalendarBoard(
  core: TaskCore,
  keys: () => string[],
  reload: () => Promise<void>,
) {
  let board = $state<Record<string, CellItem[]>>({})
  let dragging = $state(false)

  // Project tasks → board, but NEVER while a gesture is live: `dragging` is read untracked,
  // so this re-runs on a real data change (a move/toggle landing, a reload) yet can't clobber
  // svelte-dnd-action's in-flight `e.detail.items`.
  $effect(() => {
    const next = buildBoard(core.tasks, keys())
    if (untrack(() => dragging)) return
    board = next
  })

  function consider(key: string, e: CustomEvent<DndEvent<CellItem>>) {
    dragging = true
    board[key] = e.detail.items
  }

  function finalize(key: string, e: CustomEvent<DndEvent<CellItem>>) {
    board[key] = e.detail.items
    dragging = false // clear before persisting so the optimistic update can re-project
    const plan = dropKind(e, key, core.tasks)
    if (plan.kind === 'none') return
    if (plan.kind === 'reorder') {
      // Same-cell drop: persist the day's new untimed order (range-safe — other days are
      // untouched). The guarded effect re-projects the board from the reordered tasks.
      void core.reorder(plan.ids)
      return
    }
    if (plan.kind === 'move-occurrence') {
      // Dragging ONE instance of a recurring task: detach it server-side (the series keeps
      // repeating, this instance becomes a one-off on the new day), then reload — the
      // server assigns the new task's id and re-expands the series, so a refetch is the
      // correct resync rather than an optimistic guess.
      void core.save(
        () =>
          api.tasks.moveOccurrence(plan.taskId, plan.occurrenceDate, plan.newDate).then(() => {}),
        reload,
        'Could not move the occurrence',
      )
      return
    }
    // Optimistic move: apply locally (the guarded effect re-projects the board to match),
    // then persist the new date and, for an untimed task, the dest day's order. No reload —
    // that's what made the move "jump back" before.
    void core.optimistic(
      () => {
        core.tasks = applyMove(core.tasks, plan.movedId, key)
      },
      async () => {
        await api.tasks.update(plan.movedId, { due_date: key })
        if (plan.reorderIds) await api.tasks.reorder(plan.reorderIds)
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
    consider,
    finalize,
  }
}
