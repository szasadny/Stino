import { SHADOW_ITEM_MARKER_PROPERTY_NAME } from 'svelte-dnd-action'
import { describe, expect, it } from 'vitest'
import { DND_FLIP_MS, DROP_TARGET_RING_CLASSES } from '../constants'
import { calendarZone, isShadowItem } from './zone-options'

describe('calendarZone', () => {
  const items = [{ id: 'a' }]

  it('shares one zone type and cursor-based hit-testing across every calendar zone', () => {
    const month = calendarZone(items)
    const week = calendarZone([], { dragDisabled: true })
    expect(month.type).toBe(week.type)
    expect(month).toMatchObject({
      items,
      useCursorForDetection: true,
      flipDurationMs: DND_FLIP_MS,
      dropTargetStyle: {},
      dropTargetClasses: ['rounded-md', ...DROP_TARGET_RING_CLASSES],
    })
  })

  it('lets a caller override any option', () => {
    const zone = calendarZone(items, { dragDisabled: true, dropTargetClasses: ['rounded-lg'] })
    expect(zone.dragDisabled).toBe(true)
    expect(zone.dropTargetClasses).toEqual(['rounded-lg'])
  })
})

describe('isShadowItem', () => {
  it('recognises the drag shadow by its marker', () => {
    expect(isShadowItem({ id: 'a', [SHADOW_ITEM_MARKER_PROPERTY_NAME]: true })).toBe(true)
    expect(isShadowItem({ id: 'a' })).toBe(false)
  })
})
