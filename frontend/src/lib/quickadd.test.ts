import { describe, expect, it } from 'vitest'
import { activeLabelToken, describeDraft, parseQuickAdd, removeActiveToken } from './quickadd'

// A fixed reference date keeps chrono deterministic: Thursday 25 June 2026.
const REF = new Date(2026, 5, 25)

describe('parseQuickAdd', () => {
  it('keeps a plain capture in the Inbox (no date found)', () => {
    expect(parseQuickAdd('buy bread', REF)).toEqual({
      title: 'buy bread',
      label: null,
      due_date: null,
      due_time: null,
      recurrence_rule: null,
    })
  })

  it('pulls a relative date out of the title', () => {
    expect(parseQuickAdd('call mum tomorrow', REF)).toEqual({
      title: 'call mum',
      label: null,
      due_date: '2026-06-26',
      due_time: null,
      recurrence_rule: null,
    })
  })

  it('captures a time only when one is stated, biasing weekdays forward', () => {
    expect(parseQuickAdd('standup 9am friday', REF)).toEqual({
      title: 'standup',
      label: null,
      due_date: '2026-06-26',
      due_time: '09:00',
      recurrence_rule: null,
    })
  })

  it('pulls a #tag out as the label, leaving a clean title', () => {
    expect(parseQuickAdd('buy milk #groceries', REF)).toEqual({
      title: 'buy milk',
      label: 'groceries',
      due_date: null,
      due_time: null,
      recurrence_rule: null,
    })
  })

  it('combines a #tag with a date, wherever the tag sits', () => {
    expect(parseQuickAdd('#work call client tomorrow 9am', REF)).toEqual({
      title: 'call client',
      label: 'work',
      due_date: '2026-06-26',
      due_time: '09:00',
      recurrence_rule: null,
    })
  })

  it('takes only the first of several #tags (one label per task)', () => {
    expect(parseQuickAdd('plan trip #travel #personal', REF)).toMatchObject({
      title: 'plan trip',
      label: 'travel',
    })
  })

  it('strips a dangling connector left before the date phrase', () => {
    expect(parseQuickAdd('submit report by friday', REF).title).toBe('submit report')
    expect(parseQuickAdd('flight on june 30', REF)).toMatchObject({
      title: 'flight',
      due_date: '2026-06-30',
    })
  })

  it('extracts a monthly recurrence by date-of-month, defaulting the start to ref', () => {
    expect(parseQuickAdd('pay rent the 1st of every month', REF)).toEqual({
      title: 'pay rent',
      label: null,
      due_date: '2026-06-25',
      due_time: null,
      recurrence_rule: 'FREQ=MONTHLY;BYMONTHDAY=1',
    })
    expect(parseQuickAdd('report the last day of every month', REF)).toMatchObject({
      title: 'report',
      recurrence_rule: 'FREQ=MONTHLY;BYMONTHDAY=-1',
    })
  })

  it('extracts a monthly recurrence by ordinal weekday', () => {
    expect(parseQuickAdd('team sync the first Monday of every month', REF)).toMatchObject({
      title: 'team sync',
      recurrence_rule: 'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1',
    })
  })

  it('extracts a weekly recurrence without leaking a one-off date from the weekday', () => {
    expect(parseQuickAdd('standup first day of every week', REF)).toMatchObject({
      title: 'standup',
      due_date: '2026-06-25',
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    expect(parseQuickAdd('gym every monday', REF)).toMatchObject({
      title: 'gym',
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
  })

  it('combines an explicit date with a recurrence phrase', () => {
    // The recurrence phrase is stripped first, so chrono still reads "friday".
    expect(parseQuickAdd('water plants friday every week', REF)).toMatchObject({
      title: 'water plants',
      due_date: '2026-06-26',
      recurrence_rule: 'FREQ=WEEKLY',
    })
  })
})

describe('describeDraft', () => {
  it('is null for an undated draft', () => {
    expect(
      describeDraft({
        title: 'x',
        label: null,
        due_date: null,
        due_time: null,
        recurrence_rule: null,
      }),
    ).toBeNull()
  })

  it('renders the date, adding the time when present', () => {
    expect(describeDraft(parseQuickAdd('call mum tomorrow', REF))).toBe('Fri 26 June')
    expect(describeDraft(parseQuickAdd('standup 9am friday', REF))).toBe('Fri 26 June, 09:00')
  })
})

describe('activeLabelToken', () => {
  it('finds the tag the caret sits in, capturing the partial', () => {
    // "buy milk #gro" with the caret at the end.
    expect(activeLabelToken('buy milk #gro', 13)).toEqual({ start: 9, query: 'gro' })
  })

  it('reports an empty query right after the #', () => {
    expect(activeLabelToken('buy milk #', 10)).toEqual({ start: 9, query: '' })
  })

  it('is null when the caret is past a finished tag or not in one', () => {
    expect(activeLabelToken('buy milk #gro ', 14)).toBeNull() // a space ended the tag
    expect(activeLabelToken('buy milk', 8)).toBeNull()
  })
})

describe('removeActiveToken', () => {
  it('cuts the active tag out and lands the caret where it began', () => {
    expect(removeActiveToken('buy milk #gro', 13)).toEqual({ text: 'buy milk ', caret: 9 })
  })

  it('leaves text untouched when the caret is not in a tag', () => {
    expect(removeActiveToken('buy milk', 8)).toEqual({ text: 'buy milk', caret: 8 })
  })
})
