import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  edgeScrollStep,
  createBottomDwell,
  pointFrom,
  EDGE_ZONE_PX,
  MAX_STEP_PX,
} from './drag-scroll'

const TOP = 100
const BOTTOM = 900

describe('edgeScrollStep', () => {
  it('does not scroll from the middle of the container', () => {
    expect(edgeScrollStep(500, TOP, BOTTOM)).toBe(0)
  })

  it('does not scroll exactly at the inner zone boundaries', () => {
    expect(edgeScrollStep(TOP + EDGE_ZONE_PX, TOP, BOTTOM)).toBe(0)
    expect(edgeScrollStep(BOTTOM - EDGE_ZONE_PX, TOP, BOTTOM)).toBe(0)
  })

  it('scrolls up (negative) near the top, down (positive) near the bottom', () => {
    expect(edgeScrollStep(TOP + 10, TOP, BOTTOM)).toBeLessThan(0)
    expect(edgeScrollStep(BOTTOM - 10, TOP, BOTTOM)).toBeGreaterThan(0)
  })

  it('ramps speed linearly with depth into the zone', () => {
    expect(edgeScrollStep(BOTTOM - EDGE_ZONE_PX / 2, TOP, BOTTOM)).toBeCloseTo(MAX_STEP_PX / 2)
    expect(edgeScrollStep(TOP + EDGE_ZONE_PX / 2, TOP, BOTTOM)).toBeCloseTo(-MAX_STEP_PX / 2)
  })

  it('reaches max speed at the edge and clamps past it (thumb overshoot)', () => {
    expect(edgeScrollStep(BOTTOM, TOP, BOTTOM)).toBe(MAX_STEP_PX)
    expect(edgeScrollStep(BOTTOM + 30, TOP, BOTTOM)).toBe(MAX_STEP_PX)
    expect(edgeScrollStep(TOP, TOP, BOTTOM)).toBe(-MAX_STEP_PX)
    expect(edgeScrollStep(TOP - 30, TOP, BOTTOM)).toBe(-MAX_STEP_PX)
  })

  it('lets the deeper-penetrated edge win in a container shorter than two zones', () => {
    expect(edgeScrollStep(110, 100, 200)).toBeLessThan(0) // near the top -> up
    expect(edgeScrollStep(190, 100, 200)).toBeGreaterThan(0) // near the bottom -> down
  })

  it('honours custom zone and step sizes', () => {
    expect(edgeScrollStep(95, 0, 100, 10, 20)).toBe(10) // half into a 10px zone, max 20
    expect(edgeScrollStep(80, 0, 100, 10, 20)).toBe(0) // outside the custom zone
  })
})

const ZONE = 64
const HOLD = 250
const DWELL_BOTTOM = 800

describe('createBottomDwell', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires after dwelling in the bottom strip for the hold duration', () => {
    const onDwell = vi.fn()
    const dwell = createBottomDwell(ZONE, HOLD, onDwell)
    dwell.move(DWELL_BOTTOM - 10, DWELL_BOTTOM)
    vi.advanceTimersByTime(HOLD - 1)
    expect(onDwell).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDwell).toHaveBeenCalledOnce()
  })

  it('does not fire if the pointer leaves the strip before the hold elapses', () => {
    const onDwell = vi.fn()
    const dwell = createBottomDwell(ZONE, HOLD, onDwell)
    dwell.move(DWELL_BOTTOM - 10, DWELL_BOTTOM)
    vi.advanceTimersByTime(HOLD - 1)
    dwell.move(DWELL_BOTTOM - ZONE - 100, DWELL_BOTTOM) // back up, out of the strip
    vi.advanceTimersByTime(HOLD * 2)
    expect(onDwell).not.toHaveBeenCalled()
  })

  it('restarts the hold from zero after leaving and re-entering', () => {
    const onDwell = vi.fn()
    const dwell = createBottomDwell(ZONE, HOLD, onDwell)
    dwell.move(DWELL_BOTTOM - 10, DWELL_BOTTOM)
    vi.advanceTimersByTime(HOLD - 1)
    dwell.move(DWELL_BOTTOM - ZONE - 100, DWELL_BOTTOM)
    dwell.move(DWELL_BOTTOM - 10, DWELL_BOTTOM) // re-enter
    vi.advanceTimersByTime(HOLD - 1)
    expect(onDwell).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDwell).toHaveBeenCalledOnce()
  })

  it('does not restart the hold on moves within the strip', () => {
    const onDwell = vi.fn()
    const dwell = createBottomDwell(ZONE, HOLD, onDwell)
    dwell.move(DWELL_BOTTOM - 10, DWELL_BOTTOM)
    vi.advanceTimersByTime(HOLD - 1)
    dwell.move(DWELL_BOTTOM - 30, DWELL_BOTTOM) // wiggle, still inside
    vi.advanceTimersByTime(1)
    expect(onDwell).toHaveBeenCalledOnce()
  })

  it('cancel() prevents a pending fire', () => {
    const onDwell = vi.fn()
    const dwell = createBottomDwell(ZONE, HOLD, onDwell)
    dwell.move(DWELL_BOTTOM - 10, DWELL_BOTTOM)
    dwell.cancel()
    vi.advanceTimersByTime(HOLD * 2)
    expect(onDwell).not.toHaveBeenCalled()
  })

  it('treats exactly the strip boundary as outside (strict >)', () => {
    const onDwell = vi.fn()
    const dwell = createBottomDwell(ZONE, HOLD, onDwell)
    dwell.move(DWELL_BOTTOM - ZONE, DWELL_BOTTOM)
    vi.advanceTimersByTime(HOLD * 2)
    expect(onDwell).not.toHaveBeenCalled()
  })
})

describe('pointFrom', () => {
  it('returns a mouse event itself', () => {
    const e = { clientX: 10, clientY: 20 } as MouseEvent
    expect(pointFrom(e)).toBe(e)
  })

  it('returns the first touch of a touch event', () => {
    const touch = { clientX: 5, clientY: 6 }
    const e = { touches: [touch] } as unknown as TouchEvent
    expect(pointFrom(e)).toBe(touch)
  })

  it('returns undefined for a touch event with no touches', () => {
    const e = { touches: [] } as unknown as TouchEvent
    expect(pointFrom(e)).toBeUndefined()
  })
})
