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

// An inverted range (panel larger than the space) pins to `min`, never off-screen.
const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), Math.max(min, max))

/** Right of the cell, flipping left on overflow, clamped into view; `position: fixed` px. */
export function panelPosition(
  anchor: Box,
  panel: Size,
  viewport: Size,
  gap = 8,
  margin = 8,
): Point {
  let left = anchor.right + gap
  if (left + panel.width + margin > viewport.width) {
    left = anchor.left - gap - panel.width
  }
  left = clamp(left, margin, viewport.width - panel.width - margin)
  const top = clamp(anchor.top, margin, viewport.height - panel.height - margin)
  return { left, top }
}
