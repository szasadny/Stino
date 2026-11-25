import { SHADOW_ITEM_MARKER_PROPERTY_NAME, type Item, type Options } from 'svelte-dnd-action'
import { DND_FLIP_MS, DROP_TARGET_RING_CLASSES } from '../constants'

const CALENDAR_DND_TYPE = 'calendar'

// One shared type lets a task drop onto any day; the held pointer, not the tile, picks the zone.
export function calendarZone<T extends Item>(
  items: T[],
  overrides: Partial<Options<T>> = {},
): Options<T> {
  return {
    items,
    type: CALENDAR_DND_TYPE,
    useCursorForDetection: true,
    flipDurationMs: DND_FLIP_MS,
    dropTargetStyle: {},
    dropTargetClasses: ['rounded-md', ...DROP_TARGET_RING_CLASSES],
    ...overrides,
  }
}

export function isShadowItem(item: object): boolean {
  return SHADOW_ITEM_MARKER_PROPERTY_NAME in item
}
