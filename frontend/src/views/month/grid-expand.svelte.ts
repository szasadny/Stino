import { MONTH_EXPAND_HOLD_MS, MONTH_EXPAND_ZONE_PX } from '../../lib/constants'
import { createBottomDwell } from '../../lib/dnd/drag-scroll'
import { trackPointer } from '../../lib/dnd/drag-scroll.action'

// Attach `watch` to the split; it re-runs as `dragging` flips, so the grid collapses back on drop.
export function createGridExpand(dragging: () => boolean) {
  let expanded = $state(false)

  function watch(split: { getBoundingClientRect(): { bottom: number } }) {
    if (!dragging()) return
    const dwell = createBottomDwell(
      MONTH_EXPAND_ZONE_PX,
      MONTH_EXPAND_HOLD_MS,
      () => (expanded = true),
    )
    const stop = trackPointer((point) =>
      dwell.move(point.clientY, split.getBoundingClientRect().bottom),
    )
    return () => {
      dwell.cancel()
      stop()
      expanded = false
    }
  }

  return {
    get expanded() {
      return expanded
    },
    watch,
  }
}
