import { describe, expect, it, vi } from 'vitest'
import { INBOX_COMPLETE_EXIT_MS, INBOX_FOLD_SLIDE_PX } from '../../lib/constants'
import { foldAway } from './fold-away'

const motion = vi.hoisted(() => ({ prefersReducedMotion: { current: false } }))
vi.mock('svelte/motion', () => motion)

const row = { offsetHeight: 40 }

describe('foldAway', () => {
  it('collapses the row while sliding it out', () => {
    const config = foldAway(row, { dragging: false })
    expect(config.duration).toBe(INBOX_COMPLETE_EXIT_MS)
    expect(config.css?.(0.5, 0.5)).toBe(
      `overflow: hidden; height: 20px; opacity: 0.5; transform: translateX(${INBOX_FOLD_SLIDE_PX / 2}px);`,
    )
  })

  it('is instant mid-drag and under reduced motion', () => {
    expect(foldAway(row, { dragging: true })).toEqual({ duration: 0 })
    motion.prefersReducedMotion.current = true
    expect(foldAway(row, { dragging: false }).duration).toBe(0)
  })
})
