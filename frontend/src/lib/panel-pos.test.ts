import { describe, expect, it } from 'vitest'
import { panelPosition, type Box, type Size } from './panel-pos'

// A day cell somewhere in the middle-left of a roomy viewport.
const cell = (over: Partial<Box> = {}): Box => ({
  top: 200,
  left: 300,
  right: 380,
  bottom: 280,
  width: 80,
  height: 80,
  ...over,
})

const panel: Size = { width: 300, height: 400 }
const viewport: Size = { width: 1280, height: 800 }

describe('panelPosition', () => {
  it('docks to the right of the cell when there is room', () => {
    const { left, top } = panelPosition(cell(), panel, viewport)
    expect(left).toBe(380 + 8) // cell.right + gap
    expect(top).toBe(200) // aligned with cell.top
  })

  it('flips to the left of the cell when the right would overflow', () => {
    // A cell hugging the right edge: right+gap+panel would exceed viewport width.
    const c = cell({ left: 1160, right: 1240 })
    const { left } = panelPosition(c, panel, viewport)
    expect(left).toBe(1160 - 8 - 300) // cell.left - gap - panel.width
  })

  it('clamps into view when neither side fits cleanly', () => {
    const narrow: Size = { width: 360, height: 800 }
    const c = cell({ left: 40, right: 320 })
    const { left } = panelPosition(c, panel, narrow, 8, 8)
    // Right overflows (320+8+300+8 > 360) so it flips left to 40-8-300 = -268,
    // then clamps to the left margin.
    expect(left).toBe(8)
  })

  it('clamps the top so the panel stays fully on screen near the bottom', () => {
    const c = cell({ top: 760, bottom: 800 })
    const { top } = panelPosition(c, panel, viewport)
    expect(top).toBe(800 - 400 - 8) // viewport.height - panel.height - margin
  })

  it('pins to the top margin when the panel is taller than the viewport', () => {
    const shortViewport: Size = { width: 1280, height: 300 }
    const { top } = panelPosition(cell(), panel, shortViewport)
    expect(top).toBe(8) // range inverted → prefer the top margin
  })
})
