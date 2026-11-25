import { describe, expect, it, vi } from 'vitest'
import { SOURCES, TRIGGERS } from 'svelte-dnd-action'
import { TAP_SLOP_PX } from '../constants'
import { dndDetail } from '../test/factories'
import { activateOnKey, createPressTracker, tappedItem, trustedClick } from './tap'

describe('activateOnKey', () => {
  it.each(['Enter', ' '])('activates on %j and suppresses the default', (key) => {
    const handler = vi.fn()
    const preventDefault = vi.fn()
    activateOnKey(handler)({ key, preventDefault })
    expect(handler).toHaveBeenCalledOnce()
    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('ignores other keys and leaves their default alone', () => {
    const handler = vi.fn()
    const preventDefault = vi.fn()
    activateOnKey(handler)({ key: 'Tab', preventDefault })
    expect(handler).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })
})

describe('trustedClick', () => {
  it('runs only for a browser-issued click, not the dnd library re-dispatch', () => {
    const handler = vi.fn()
    const onClick = trustedClick(handler)
    onClick({ isTrusted: false })
    expect(handler).not.toHaveBeenCalled()
    onClick({ isTrusted: true })
    expect(handler).toHaveBeenCalledOnce()
  })
})

describe('createPressTracker', () => {
  it('is not stationary before any press', () => {
    expect(createPressTracker().stationary).toBe(false)
  })

  it('keeps a long press that never moved stationary', () => {
    const t = createPressTracker()
    t.down({ pointerId: 1, x: 100, y: 100 })
    t.move({ pointerId: 1, x: 103, y: 104 })
    expect(t.stationary).toBe(true)
  })

  it('counts the farthest point, even if the finger comes back', () => {
    const t = createPressTracker()
    t.down({ pointerId: 1, x: 100, y: 100 })
    t.move({ pointerId: 1, x: 100, y: 100 + TAP_SLOP_PX })
    t.move({ pointerId: 1, x: 100, y: 100 })
    expect(t.stationary).toBe(false)
  })

  it('ignores other pointers and resets on the next press', () => {
    const t = createPressTracker()
    t.down({ pointerId: 1, x: 0, y: 0 })
    t.move({ pointerId: 2, x: 500, y: 500 })
    expect(t.stationary).toBe(true)
    t.move({ pointerId: 1, x: 50, y: 0 })
    t.down({ pointerId: 3, x: 0, y: 0 })
    expect(t.stationary).toBe(true)
  })

  it('keeps measuring through touch moves after the pointer stream stops', () => {
    const t = createPressTracker()
    t.down({ pointerId: 1, x: 0, y: 0 })
    t.touchMove(2, 3)
    expect(t.stationary).toBe(true)
    t.touchMove(0, 40)
    expect(t.stationary).toBe(false)
  })
})

describe('tappedItem', () => {
  type Row = { id: number; title: string }
  const rows: Row[] = [
    { id: 1, title: 'a' },
    { id: 2, title: 'b' },
  ]
  const detail = (trigger: TRIGGERS, source: SOURCES = SOURCES.POINTER, id = '2') =>
    dndDetail(rows, trigger, id, source)

  it('returns the dropped item for a stationary pointer drop in its own zone', () => {
    expect(tappedItem(detail(TRIGGERS.DROPPED_INTO_ZONE), true)).toEqual({ id: 2, title: 'b' })
  })

  it('matches string ids against numeric item ids', () => {
    expect(tappedItem(detail(TRIGGERS.DROPPED_INTO_ZONE, SOURCES.POINTER, '1'), true)).toEqual({
      id: 1,
      title: 'a',
    })
  })

  it('is not a tap when the press moved', () => {
    expect(tappedItem(detail(TRIGGERS.DROPPED_INTO_ZONE), false)).toBeUndefined()
  })

  it('is not a tap for keyboard drops or non-landing zones', () => {
    expect(tappedItem(detail(TRIGGERS.DROPPED_INTO_ZONE, SOURCES.KEYBOARD), true)).toBeUndefined()
    expect(tappedItem(detail(TRIGGERS.DROPPED_INTO_ANOTHER), true)).toBeUndefined()
  })
})
