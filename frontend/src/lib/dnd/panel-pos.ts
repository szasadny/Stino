import { PANEL_GAP_PX, PANEL_MARGIN_PX } from '../constants'

interface Box {
  top: number
  left: number
  right: number
}

interface Size {
  width: number
  height: number
}

// An inverted range (panel larger than the space) pins to `min`, never off-screen.
const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), Math.max(min, max))

// Right of the cell, flipping left on overflow, clamped into view; `position: fixed` px.
export function panelPosition(
  anchor: Box,
  panel: Size,
  viewport: Size,
  gap = PANEL_GAP_PX,
  margin = PANEL_MARGIN_PX,
): { left: number; top: number } {
  let left = anchor.right + gap
  if (left + panel.width + margin > viewport.width) {
    left = anchor.left - gap - panel.width
  }
  left = clamp(left, margin, viewport.width - panel.width - margin)
  const top = clamp(anchor.top, margin, viewport.height - panel.height - margin)
  return { left, top }
}
