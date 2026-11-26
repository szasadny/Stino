import { describe, expect, it, vi } from 'vitest'
import { dismissesOnRelease, interceptsEscape, isOutsidePress } from './dismiss'

const box = { left: 100, right: 300, top: 50, bottom: 250 }
const outside = { fallback: true, onBackdrop: true, x: 10, y: 10, box: () => box }

describe('interceptsEscape', () => {
  const escape = { key: 'Escape', isComposing: false, fromThisDialog: true }

  it('intercepts when the handler reports it handled the Escape', () => {
    expect(interceptsEscape(escape, () => true)).toBe(true)
    expect(interceptsEscape(escape, () => false)).toBe(false)
  })

  it.each([
    ['another key', { ...escape, key: 'Enter' }],
    ['an IME composition', { ...escape, isComposing: true }],
    ['a nested dialog', { ...escape, fromThisDialog: false }],
  ])('leaves %s alone without asking the handler', (_, press) => {
    const onEscape = vi.fn(() => true)
    expect(interceptsEscape(press, onEscape)).toBe(false)
    expect(onEscape).not.toHaveBeenCalled()
  })

  it('leaves Escape to the dialog when there is no handler', () => {
    expect(interceptsEscape(escape, undefined)).toBe(false)
  })
})

describe('isOutsidePress', () => {
  const press = outside

  it('is a press on the backdrop outside the dialog box', () => {
    expect(isOutsidePress(press)).toBe(true)
    expect(isOutsidePress({ ...press, x: 200, y: 300 })).toBe(true)
  })

  it('is not a press inside the box, edges included', () => {
    expect(isOutsidePress({ ...press, x: 200, y: 150 })).toBe(false)
    expect(isOutsidePress({ ...press, x: 100, y: 250 })).toBe(false)
  })

  it('is never one with native light dismiss or on the dialog content, and skips measuring', () => {
    const measure = vi.fn(() => box)
    expect(isOutsidePress({ ...press, fallback: false, box: measure })).toBe(false)
    expect(isOutsidePress({ ...press, onBackdrop: false, box: measure })).toBe(false)
    expect(measure).not.toHaveBeenCalled()
  })
})

describe('dismissesOnRelease', () => {
  it('closes only when both the press and the release were outside', () => {
    expect(dismissesOnRelease(true, outside)).toBe(true)
    expect(dismissesOnRelease(false, outside)).toBe(false)
    expect(dismissesOnRelease(true, { ...outside, x: 200, y: 150 })).toBe(false)
  })
})
