import { SOURCES, TRIGGERS, type DndEvent } from 'svelte-dnd-action'
import { LABEL_PALETTE } from '../palette'
import type { Label, Task } from '../types'

// Week of Monday 1 June 2026.
export const MON = '2026-06-01'
export const TUE = '2026-06-02'
export const WED = '2026-06-03'
export const THU = '2026-06-04'
export const FRI = '2026-06-05'
export const NEXT_MON = '2026-06-08'

// Pinned "today"s keep chrono and first-occurrence scans deterministic.
export const REF_THURSDAY = new Date(2026, 5, 25)
export const REF_THURSDAY_ISO = '2026-06-25'
export const REF_SUNDAY = new Date(2026, 9, 25)
export const REF_SUNDAY_ISO = '2026-10-25'

export const WORKDAY_LIST = 'MO,TU,WE,TH,FR'

export const RRULE = {
  daily: 'FREQ=DAILY',
  weekly: 'FREQ=WEEKLY',
  yearly: 'FREQ=YEARLY',
  workdays: `FREQ=WEEKLY;BYDAY=${WORKDAY_LIST}`,
  firstWorkday: `FREQ=MONTHLY;BYDAY=${WORKDAY_LIST};BYSETPOS=1`,
  lastWorkday: `FREQ=MONTHLY;BYDAY=${WORKDAY_LIST};BYSETPOS=-1`,
} as const

export function makeTask(over: Partial<Task> = {}): Task {
  const id = over.id ?? 1
  return {
    id,
    title: `T${id}`,
    notes: null,
    label_id: null,
    due_date: null,
    due_time: null,
    recurrence_rule: null,
    occurrence_date: null,
    sort_order: 0,
    completed: false,
    ...over,
  }
}

// Each wrapper sets its own field last, so they compose: `timed('09:00', on(MON))`.
export function on(date: string | null, over: Partial<Task> = {}): Task {
  return makeTask({ ...over, due_date: date, occurrence_date: date })
}

export function timed(time: string, over: Partial<Task> = {}): Task {
  return makeTask({ ...over, due_time: time })
}

export function done(over: Partial<Task> = {}): Task {
  return makeTask({ ...over, completed: true })
}

export function recurring(over: Partial<Task> = {}, rule: string = RRULE.daily): Task {
  return makeTask({ ...over, recurrence_rule: rule })
}

export function makeLabel(over: Partial<Label> = {}): Label {
  const id = over.id ?? 1
  return {
    id,
    name: `L${id}`,
    color: LABEL_PALETTE[0].hex,
    emoji: null,
    sort_order: 0,
    ...over,
  }
}

export function deferred<T = void>() {
  let resolve: (value: T) => void = () => {}
  let reject: (err: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export function dndDetail<T>(
  items: T[],
  trigger: TRIGGERS,
  id: string,
  source: SOURCES = SOURCES.POINTER,
): DndEvent<T> {
  return { items, info: { trigger, id, source } }
}
