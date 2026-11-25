import { describe, expect, it } from 'vitest'
import { PANEL_GAP_PX as GAP, PANEL_MARGIN_PX as MARGIN } from '../constants'
import { panelPosition } from './panel-pos'

type Box = Parameters<typeof panelPosition>[0]
type Size = Parameters<typeof panelPosition>[1]

const cell = (over: Partial<Box> = {}): Box => ({ top: 200, left: 300, right: 380, ...over })

const panel: Size = { width: 300, height: 400 }
const viewport: Size = { width: 1280, height: 800 }

describe('panelPosition', () => {
  it('docks to the right of the cell when there is room', () => {
    const { left, top } = panelPosition(cell(), panel, viewport)
    expect(left).toBe(380 + GAP)
    expect(top).toBe(200)
  })

  it('flips to the left of the cell when the right would overflow', () => {
    const c = cell({ left: 1160, right: 1240 })
    const { left } = panelPosition(c, panel, viewport)
    expect(left).toBe(1160 - GAP - panel.width)
  })

  it('clamps into view when neither side fits cleanly', () => {
    const narrow: Size = { width: 360, height: 800 }
    const c = cell({ left: 40, right: 320 })
    const { left } = panelPosition(c, panel, narrow)
    expect(left).toBe(MARGIN)
  })

  it('clamps the top so the panel stays fully on screen near the bottom', () => {
    const c = cell({ top: 760 })
    const { top } = panelPosition(c, panel, viewport)
    expect(top).toBe(viewport.height - panel.height - MARGIN)
  })

  it('pins to the top margin when the panel is taller than the viewport', () => {
    const shortViewport: Size = { width: 1280, height: 300 }
    const { top } = panelPosition(cell(), panel, shortViewport)
    expect(top).toBe(MARGIN)
  })
})
