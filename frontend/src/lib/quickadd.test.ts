import { describe, expect, it } from 'vitest'
import { describeDraft, parseQuickAdd } from './quickadd'

// A fixed reference date keeps chrono deterministic: Thursday 25 June 2026.
const REF = new Date(2026, 5, 25)

describe('parseQuickAdd', () => {
  it('keeps a plain capture in the Inbox (no date found)', () => {
    expect(parseQuickAdd('buy bread', REF)).toEqual({
      title: 'buy bread',
      due_date: null,
      due_time: null,
    })
  })

  it('pulls a relative date out of the title', () => {
    expect(parseQuickAdd('call mum tomorrow', REF)).toEqual({
      title: 'call mum',
      due_date: '2026-06-26',
      due_time: null,
    })
  })

  it('captures a time only when one is stated, biasing weekdays forward', () => {
    expect(parseQuickAdd('standup 9am friday', REF)).toEqual({
      title: 'standup',
      due_date: '2026-06-26',
      due_time: '09:00',
    })
  })

  it('strips a dangling connector left before the date phrase', () => {
    expect(parseQuickAdd('submit report by friday', REF).title).toBe('submit report')
    expect(parseQuickAdd('flight on june 30', REF)).toMatchObject({
      title: 'flight',
      due_date: '2026-06-30',
    })
  })
})

describe('describeDraft', () => {
  it('is null for an undated draft', () => {
    expect(describeDraft({ title: 'x', due_date: null, due_time: null })).toBeNull()
  })

  it('renders the date, adding the time when present', () => {
    expect(describeDraft(parseQuickAdd('call mum tomorrow', REF))).toBe('Fri 26 June')
    expect(describeDraft(parseQuickAdd('standup 9am friday', REF))).toBe('Fri 26 June, 09:00')
  })
})
