import { afterEach, describe, expect, it, vi } from 'vitest'
import { toISODate } from './date'
import { MON, TUE, WED } from './test/factories'
import { setToday, todayDate, todayKey } from './today.svelte'

afterEach(() => vi.useRealTimers())

describe('today', () => {
  it("starts on the device clock's local date", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 3, 23, 30))
    vi.resetModules()
    const fresh = await import('./today.svelte')
    expect(fresh.todayKey()).toBe(WED)
  })

  it('reports a change only when the day actually moves', () => {
    setToday(MON)
    expect(setToday(MON)).toBe(false)
    expect(setToday(TUE)).toBe(true)
    expect(todayKey()).toBe(TUE)
  })

  it('reads the key back as local midnight', () => {
    setToday(MON)
    const date = todayDate()
    expect([toISODate(date), date.getHours()]).toEqual([MON, 0])
  })
})
