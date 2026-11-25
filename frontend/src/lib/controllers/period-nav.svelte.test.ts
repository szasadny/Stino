import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { addWeeks, buildWeekGrid, spanBounds, startOfWeek, toISODate } from '../date'
import { LOAD_FAILED } from '../messages'
import { navigateWithSlide } from '../nav-transition'
import { MON, NEXT_MON, WED, on } from '../test/factories'
import { setToday } from '../today.svelte'
import { createPeriodNav, type PeriodNav } from './period-nav.svelte'
import { createTaskCore, type TaskCore } from './task-core.svelte'

vi.mock('../api', () => ({
  api: {
    labels: { list: vi.fn() },
    tasks: { range: vi.fn() },
  },
}))

vi.mock('../nav-transition', () => ({
  navigateWithSlide: vi.fn(
    async (_dir: 'forward' | 'back' | null, apply: () => void | Promise<void>) => {
      await apply()
    },
  ),
}))

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const LAST_MON = '2026-05-25'

describe('createPeriodNav', () => {
  let core: TaskCore
  let nav: PeriodNav
  let onNavigate: ReturnType<typeof vi.fn<() => void>>
  let cleanup: () => void

  beforeEach(async () => {
    setToday(WED)
    vi.mocked(api.labels.list).mockResolvedValue([])
    vi.mocked(api.tasks.range).mockReset().mockResolvedValue([])
    vi.mocked(navigateWithSlide).mockClear()
    onNavigate = vi.fn<() => void>()
    cleanup = $effect.root(() => {
      core = createTaskCore()
      nav = createPeriodNav(core, {
        periodStart: startOfWeek,
        step: addWeeks,
        rangeFor: (start) => spanBounds(buildWeekGrid(start)),
        failMsg: LOAD_FAILED,
        onNavigate,
      })
    })
    flushSync()
    await settle()
  })

  afterEach(() => cleanup())

  it('starts on the current period and loads its range', () => {
    expect(toISODate(nav.start)).toBe(MON)
    expect(api.tasks.range).toHaveBeenCalledWith(MON, '2026-06-07')
  })

  it('fetches the next period before sliding it in, then commits it', async () => {
    vi.mocked(api.tasks.range).mockResolvedValueOnce([on(NEXT_MON, { id: 7 })])
    await nav.go(1)
    expect(api.tasks.range).toHaveBeenLastCalledWith(NEXT_MON, '2026-06-14')
    const fetched = vi.mocked(api.tasks.range).mock.invocationCallOrder.at(-1) ?? Infinity
    const slid = vi.mocked(navigateWithSlide).mock.invocationCallOrder[0] ?? -Infinity
    expect(fetched).toBeLessThan(slid)
    expect(navigateWithSlide).toHaveBeenCalledWith('forward', expect.any(Function))
    expect(toISODate(nav.start)).toBe(NEXT_MON)
    expect(core.tasks.map((t) => t.id)).toEqual([7])
    expect(onNavigate).toHaveBeenCalledOnce()
  })

  it('builds a second step taken mid-load on the first', async () => {
    await Promise.all([nav.go(1), nav.go(1)])
    expect(api.tasks.range).toHaveBeenLastCalledWith('2026-06-15', '2026-06-21')
    expect(toISODate(nav.start)).toBe('2026-06-15')
  })

  it('steps from the period on screen again after a failed load', async () => {
    vi.mocked(api.tasks.range).mockRejectedValueOnce('down')
    await nav.go(1)
    expect(toISODate(nav.start)).toBe(MON)
    await nav.go(1)
    expect(toISODate(nav.start)).toBe(NEXT_MON)
  })

  it('slides back for a negative step', async () => {
    await nav.go(-1)
    expect(navigateWithSlide).toHaveBeenCalledWith('back', expect.any(Function))
    expect(toISODate(nav.start)).toBe(LAST_MON)
  })

  it('returns to the current period from either side, without a slide when already there', async () => {
    await nav.go(2)
    await nav.goToday()
    expect(navigateWithSlide).toHaveBeenLastCalledWith('back', expect.any(Function))
    await nav.go(-1)
    await nav.goToday()
    expect(navigateWithSlide).toHaveBeenLastCalledWith('forward', expect.any(Function))
    await nav.goToday()
    expect(navigateWithSlide).toHaveBeenLastCalledWith(null, expect.any(Function))
    expect(toISODate(nav.start)).toBe(MON)
  })
})
