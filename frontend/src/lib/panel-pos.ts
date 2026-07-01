// Pure placement math for the desktop day panel (DayPanel): given the anchor day
// cell's rect, the panel's measured size, and the viewport, return the fixed
// top/left (viewport pixels) that keeps the panel beside the cell and fully on
// screen. Kept out of the component so the geometry is unit-testable and the
// component stays thin.

export interface Box {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export interface Point {
  left: number
  top: number
}

// Clamp `v` into [min, max]; if the range is inverted (panel larger than the space)
// prefer `min` so the panel pins to the top/left margin rather than going off-screen.
const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), Math.max(min, max))

/**
 * Place the panel just to the RIGHT of the anchor cell; if it would overflow the
 * viewport's right edge, flip it to the LEFT of the cell; either way clamp it fully
 * into view. Vertically, align the panel's top with the cell's top, clamped so the
 * whole panel stays on screen. All inputs/outputs are `position: fixed` pixels.
 */
export function panelPosition(
  anchor: Box,
  panel: Size,
  viewport: Size,
  gap = 8,
  margin = 8,
): Point {
  let left = anchor.right + gap
  if (left + panel.width + margin > viewport.width) {
    // Not enough room to the right — dock to the left of the cell instead.
    left = anchor.left - gap - panel.width
  }
  left = clamp(left, margin, viewport.width - panel.width - margin)
  const top = clamp(anchor.top, margin, viewport.height - panel.height - margin)
  return { left, top }
}
