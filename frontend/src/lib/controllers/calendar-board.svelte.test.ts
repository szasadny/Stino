import { flushSync } from 'svelte'
import {
  SHADOW_ITEM_MARKER_PROPERTY_NAME,
  SOURCES,
  TRIGGERS,
  type DndEvent,
} from 'svelte-dnd-action'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { presses } from '../dnd/presses.action'
import { occurrenceKey } from '../tasks/predicates'
import type { CellItem } from '../tasks/projection'
import { MON, TUE, deferred, dndDetail, on, timed } from '../test/factories'
import type { Task } from '../types'
import { createCalendarBoard, type CalendarBoard } from './calendar-board.svelte'
import { createTaskCore, type TaskCore } from './task-core.svelte'

vi.mock('../api', () => ({ api: { tasks: { reorder: vi.fn(), update: vi.fn() } } }))

const item = (task: Task): CellItem => ({ id: occurrenceKey(task), task })
const event = (detail: DndEvent<CellItem>) => new CustomEvent('dnd', { detail })
const ids = (items: CellItem[] | undefined) => items?.map((it) => it.task.id)
const settled = () => new Promise((r) => setTimeout(r, 0))
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
    vi.mocked(api.tasks.update).mockReset()
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
  it('shows the projection again after a drop that saves nothing', () => {
    const c = timed('09:00', on(MON, { id: 3 }))
    core.insert(c)
    flushSync()
    const before = ids(board.board[MON])
    const dropped = [...(board.board[MON] ?? [])].reverse()
    board.consider(MON, event(dndDetail(dropped, TRIGGERS.DRAG_STARTED, item(c).id)))
    board.finalize(MON, event(dndDetail(dropped, TRIGGERS.DROPPED_INTO_ZONE, item(c).id)))
    expect(ids(board.board[MON])).toEqual(before)
    expect(board.dragging).toBe(false)
  })

  it('snaps back when the task is dropped outside every day', () => {
    board.consider(MON, event(dndDetail([item(b), item(a)], TRIGGERS.DRAG_STARTED, item(a).id)))
    board.finalize(
      MON,
      event(dndDetail([item(b), item(a)], TRIGGERS.DROPPED_OUTSIDE_OF_ANY, item(a).id)),
    )
    expect(ids(board.board[MON])).toEqual([1, 2])
  })

  it('ignores a reload during a drag and shows it once the drop has saved', async () => {
    board.consider(MON, event(dndDetail([item(b), item(a)], TRIGGERS.DRAG_STARTED, item(b).id)))
    core.insert(on(TUE, { id: 4 }))
    flushSync()
    expect(ids(board.board[TUE])).toEqual([])
    board.finalize(
      MON,
      event(dndDetail([item(a), item(b)], TRIGGERS.DROPPED_INTO_ZONE, item(b).id)),
    )
    await settled()
    expect(ids(board.board[TUE])).toEqual([4])
  })

  describe.each([
    ['pointer: landing day first', SOURCES.POINTER, [TUE, MON]],
    ['keyboard: origin day first', SOURCES.KEYBOARD, [MON, TUE]],
  ] as const)('a cross-day drop (%s)', (_name, source, order) => {
    function drop() {
      const detail = {
        [TUE]: dndDetail([item(b)], TRIGGERS.DROPPED_INTO_ZONE, item(b).id, source),
        [MON]: dndDetail([item(a)], TRIGGERS.DROPPED_INTO_ANOTHER, item(b).id, source),
      }
      board.consider(
        MON,
        event(dndDetail([item(a), item(b)], TRIGGERS.DRAG_STARTED, item(b).id, source)),
      )
      for (const key of order) board.finalize(key, event(detail[key]))
      if (source === SOURCES.KEYBOARD)
        board.consider(TUE, event(dndDetail([item(b)], TRIGGERS.DRAG_STOPPED, item(b).id, source)))
    }

    it('keeps the move on screen while it saves and after it lands', async () => {
      const write = deferred<Task>()
      vi.mocked(api.tasks.update).mockReturnValue(write.promise)
      drop()
      expect(board.dragging).toBe(false)
      expect([ids(board.board[MON]), ids(board.board[TUE])]).toEqual([[1], [2]])
      write.resolve(on(TUE, { id: 2 }))
      await settled()
      expect([ids(board.board[MON]), ids(board.board[TUE])]).toEqual([[1], [2]])
    })

    it('puts the task back on its day when the save fails', async () => {
      vi.mocked(api.tasks.update).mockRejectedValue(new Error('offline'))
      drop()
      await settled()
      expect([ids(board.board[MON]), ids(board.board[TUE])]).toEqual([[1, 2], []])
    })
  })
})
