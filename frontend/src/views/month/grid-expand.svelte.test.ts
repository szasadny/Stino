import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MONTH_EXPAND_HOLD_MS, MONTH_EXPAND_ZONE_PX } from '../../lib/constants'
import { trackPointer } from '../../lib/dnd/drag-scroll.action'
import { createGridExpand } from './grid-expand.svelte'

vi.mock('../../lib/dnd/drag-scroll.action', () => ({ trackPointer: vi.fn() }))

const BOTTOM = 600
const split = { getBoundingClientRect: () => ({ bottom: BOTTOM }) }

describe('createGridExpand', () => {
  let move: (point: { clientX: number; clientY: number }) => void
  const stop = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    stop.mockClear()
    vi.mocked(trackPointer)
      .mockReset()
      .mockImplementation((onMove) => {
        move = onMove
        return stop
      })
  })

  afterEach(() => vi.useRealTimers())

  it('ignores the pointer while no task is held', () => {
    expect(createGridExpand(() => false).watch(split)).toBeUndefined()
    expect(trackPointer).not.toHaveBeenCalled()
  })

  it('expands after a dwell near the bottom and collapses once the gesture ends', () => {
    const expand = createGridExpand(() => true)
    const release = expand.watch(split)
    move({ clientX: 0, clientY: BOTTOM - MONTH_EXPAND_ZONE_PX / 2 })
    vi.advanceTimersByTime(MONTH_EXPAND_HOLD_MS)
    expect(expand.expanded).toBe(true)
    release?.()
    expect(expand.expanded).toBe(false)
    expect(stop).toHaveBeenCalledOnce()
  })

  it('does not expand while the pointer stays above the zone', () => {
    const expand = createGridExpand(() => true)
    expand.watch(split)
    move({ clientX: 0, clientY: BOTTOM - MONTH_EXPAND_ZONE_PX * 2 })
    vi.advanceTimersByTime(MONTH_EXPAND_HOLD_MS)
    expect(expand.expanded).toBe(false)
  })
})
