import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fromISODate } from '../date'
import { MON, TUE, on } from '../test/factories'
import { createCalendarSelection, type CalendarSelection } from './calendar-selection.svelte'
import { createTaskCore, type TaskCore } from './task-core.svelte'

describe('createCalendarSelection', () => {
  let core: TaskCore
  let selection: CalendarSelection
  let cleanup: () => void

  beforeEach(() => {
    cleanup = $effect.root(() => {
      core = createTaskCore()
      selection = createCalendarSelection(core)
    })
    core.insert(on(MON, { id: 1 }))
    core.insert(on(TUE, { id: 2 }))
    core.insert(on(MON, { id: 3 }))
    flushSync()
  })

  afterEach(() => cleanup())

  it('starts with no day open', () => {
    expect([selection.selectedDate, selection.selectedKey, selection.selectedTasks]).toEqual([
      null,
      null,
      [],
    ])
  })

  it("lists the open day's tasks and follows the core", () => {
    selection.select(fromISODate(MON))
    expect(selection.selectedKey).toBe(MON)
    expect(selection.selectedTasks.map((t) => t.id)).toEqual([1, 3])
    core.dropIds([1])
    expect(selection.selectedTasks.map((t) => t.id)).toEqual([3])
  })

  it('closes the open day', () => {
    selection.select(fromISODate(TUE))
    selection.clear()
    expect([selection.selectedDate, selection.selectedTasks, selection.anchorRect]).toEqual([
      null,
      [],
      null,
    ])
  })
})
