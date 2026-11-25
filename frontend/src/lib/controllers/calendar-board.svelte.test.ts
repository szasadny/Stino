import { flushSync } from 'svelte'
import { SHADOW_ITEM_MARKER_PROPERTY_NAME, TRIGGERS, type DndEvent } from 'svelte-dnd-action'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { presses } from '../dnd/presses.action'
import { occurrenceKey } from '../tasks/predicates'
import type { CellItem } from '../tasks/projection'
import { MON, TUE, dndDetail, on } from '../test/factories'
import type { Task } from '../types'
import { createCalendarBoard, type CalendarBoard } from './calendar-board.svelte'
import { createTaskCore, type TaskCore } from './task-core.svelte'

vi.mock('../api', () => ({ api: { tasks: { reorder: vi.fn(), update: vi.fn() } } }))

const item = (task: Task): CellItem => ({ id: occurrenceKey(task), task })
const event = (detail: DndEvent<CellItem>) => new CustomEvent('dnd', { detail })
const press = (travel: number) => {
  presses.down({ pointerId: 1, x: 0, y: 0 })
  presses.move({ pointerId: 1, x: travel, y: 0 })
}

describe('createCalendarBoard', () => {
  const a = on(MON, { id: 1, sort_order: 0 })
  const b = on(MON, { id: 2, sort_order: 1 })
  let core: TaskCore
  let board: CalendarBoard
  let open: ReturnType<typeof vi.fn<(task: Task) => void>>
  let cleanup: () => void

  beforeEach(() => {
    vi.mocked(api.tasks.reorder).mockReset().mockResolvedValue(undefined)
    press(100)
    open = vi.fn<(task: Task) => void>()
    cleanup = $effect.root(() => {
      core = createTaskCore()
      core.insert(a)
      core.insert(b)
      board = createCalendarBoard(core, () => [MON, TUE], open)
    })
    flushSync()
  })

  afterEach(() => cleanup())

  it('projects the tasks onto every visible day', () => {
    expect(board.board[MON]?.map((it) => it.task.id)).toEqual([1, 2])
    expect(board.board[TUE]).toEqual([])
  })

  it('marks the day under a held shadow item and clears it on drop', () => {
    const shadow = { ...item(a), [SHADOW_ITEM_MARKER_PROPERTY_NAME]: true }
    board.consider(TUE, event(dndDetail([shadow], TRIGGERS.DRAGGED_OVER_INDEX, shadow.id)))
    expect([board.dropKey, board.dragging]).toEqual([TUE, true])
    board.finalize(TUE, event(dndDetail([item(a)], TRIGGERS.DROPPED_INTO_ANOTHER, shadow.id)))
    expect(board.dropKey).toBeNull()
  })

  it('saves a same-day reorder through the core', () => {
    const items = [item(b), item(a)]
    board.finalize(MON, event(dndDetail(items, TRIGGERS.DROPPED_INTO_ZONE, item(b).id)))
    expect(api.tasks.reorder).toHaveBeenCalledWith([2, 1])
    expect(open).not.toHaveBeenCalled()
  })

  it('opens the task instead of moving it when the press never left its spot', () => {
    press(0)
    board.finalize(
      MON,
      event(dndDetail([item(a), item(b)], TRIGGERS.DROPPED_INTO_ZONE, item(a).id)),
    )
    expect(open).toHaveBeenCalledWith(a)
    expect(api.tasks.reorder).not.toHaveBeenCalled()
  })
})
