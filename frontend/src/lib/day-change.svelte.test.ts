import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { createDayChange } from './day-change.svelte'
import { bumpRefresh } from './refresh.svelte'
import { REF_THURSDAY_ISO } from './test/factories'
import { setToday, todayKey } from './today.svelte'

vi.mock('./api', () => ({ api: { tasks: { rollover: vi.fn() } } }))
vi.mock('./refresh.svelte', () => ({ bumpRefresh: vi.fn() }))

const FRIDAY_ISO = '2026-06-26'

describe('createDayChange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 25, 9))
    setToday(REF_THURSDAY_ISO)
    vi.clearAllMocks()
  })

  afterEach(() => vi.useRealTimers())

  it('rolls over once per day and stays quiet when nothing moved', async () => {
    vi.mocked(api.tasks.rollover).mockResolvedValue({ moved: 0 })
    const day = createDayChange()
    await day.check()
    await day.check()
    expect(api.tasks.rollover).toHaveBeenCalledOnce()
    expect(api.tasks.rollover).toHaveBeenCalledWith(REF_THURSDAY_ISO)
    expect(bumpRefresh).not.toHaveBeenCalled()
  })

  it('refreshes the views when the rollover moved tasks', async () => {
    vi.mocked(api.tasks.rollover).mockResolvedValue({ moved: 2 })
    await createDayChange().check()
    expect(bumpRefresh).toHaveBeenCalledOnce()
  })

  it('retries a failed rollover on the next check', async () => {
    vi.mocked(api.tasks.rollover).mockRejectedValueOnce(new Error('down'))
    vi.mocked(api.tasks.rollover).mockResolvedValueOnce({ moved: 0 })
    const day = createDayChange()
    await day.check()
    await day.check()
    expect(api.tasks.rollover).toHaveBeenCalledTimes(2)
    expect(bumpRefresh).not.toHaveBeenCalled()
  })

  it('advances today only after the new day rolled over', async () => {
    const seenToday: string[] = []
    vi.mocked(api.tasks.rollover).mockImplementation(async () => {
      seenToday.push(todayKey())
      return { moved: 0 }
    })
    const day = createDayChange()
    await day.check()
    vi.setSystemTime(new Date(2026, 5, 26, 0, 5))
    await day.check()
    expect(vi.mocked(api.tasks.rollover).mock.calls.map(([d]) => d)).toEqual([
      REF_THURSDAY_ISO,
      FRIDAY_ISO,
    ])
    expect(seenToday).toEqual([REF_THURSDAY_ISO, REF_THURSDAY_ISO])
    expect(todayKey()).toBe(FRIDAY_ISO)
    expect(bumpRefresh).toHaveBeenCalledOnce()
  })
})
