import { describe, expect, it } from 'vitest'
import {
  activeLabelToken,
  describeDraft,
  quickAddInput,
  labelSuggestions,
  listboxStep,
  parseQuickAdd,
  removeActiveToken,
} from './quickadd'
import {
  makeLabel,
  REF_SUNDAY as SUNDAY,
  REF_THURSDAY as REF,
  REF_THURSDAY_ISO,
  RRULE,
} from './test/factories'

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

  it('extracts a monthly recurrence by date-of-month, starting on its first occurrence', () => {
    expect(parseQuickAdd('pay rent the 1st of every month', REF)).toEqual({
      title: 'pay rent',
      label: null,
      due_date: '2026-07-01',
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

  it('extracts a monthly recurrence on the first/last workday', () => {
    expect(parseQuickAdd('payroll the last workday of every month', REF)).toEqual({
      title: 'payroll',
      label: null,
      due_date: '2026-06-30',
      due_time: null,
      recurrence_rule: RRULE.lastWorkday,
    })
    expect(
      parseQuickAdd('send report #work the first business day of the month', REF),
    ).toMatchObject({
      title: 'send report',
      label: 'work',
      recurrence_rule: RRULE.firstWorkday,
    })
  })

  it('extracts a weekly recurrence without leaking a one-off date from the weekday', () => {
    expect(parseQuickAdd('standup first day of every week', REF)).toMatchObject({
      title: 'standup',
      due_date: '2026-06-29',
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    expect(parseQuickAdd('gym every monday', REF)).toMatchObject({
      title: 'gym',
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
  })

  it('extracts an "every weekday" repeat as weekly Mon–Fri', () => {
    expect(parseQuickAdd('check email every weekday', REF)).toMatchObject({
      title: 'check email',
      due_date: REF_THURSDAY_ISO,
      recurrence_rule: RRULE.workdays,
    })
    expect(parseQuickAdd('standup every workday at 9am', REF)).toMatchObject({
      title: 'standup',
      due_time: '09:00',
      recurrence_rule: RRULE.workdays,
    })
  })

  it('combines an explicit date with a recurrence phrase', () => {
    expect(parseQuickAdd('water plants friday every week', REF)).toMatchObject({
      title: 'water plants',
      due_date: '2026-06-26',
      recurrence_rule: RRULE.weekly,
    })
  })

  // Interval weeks/months count from the start's own week/month, as RRULE does.
  it.each([
    ['Trash every other tuesday', 'Trash', 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU', '2026-07-07'],
    ['Clean every 3 days', 'Clean', 'FREQ=DAILY;INTERVAL=3', REF_THURSDAY_ISO],
    [
      'Review every 2 weeks on mon and wed',
      'Review',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
      '2026-07-06',
    ],
    ['Pay on the 31st every month', 'Pay', 'FREQ=MONTHLY;BYMONTHDAY=31', '2026-07-31'],
    [
      'Rent every 2 months on the 15th',
      'Rent',
      'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15',
      '2026-08-15',
    ],
  ])('reads "%s" as an interval repeat, not a chrono date', (input, title, rule, due_date) => {
    expect(parseQuickAdd(input, REF)).toEqual({
      title,
      label: null,
      due_date,
      due_time: null,
      recurrence_rule: rule,
    })
  })

  it('anchors a bare "every other month" to the start date', () => {
    expect(parseQuickAdd('haircut every other month', REF).recurrence_rule).toBe(
      'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=25',
    )
    expect(parseQuickAdd('haircut july 3 every month', REF)).toMatchObject({
      title: 'haircut',
      due_date: '2026-07-03',
      recurrence_rule: 'FREQ=MONTHLY;BYMONTHDAY=3',
    })
  })

  it('snaps a start the rule never generates onto its first occurrence', () => {
    expect(parseQuickAdd('Gym every monday at 6pm', SUNDAY)).toMatchObject({
      title: 'Gym',
      due_date: '2026-10-26',
      due_time: '18:00',
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    expect(parseQuickAdd('Rent first monday of every month', SUNDAY)).toMatchObject({
      due_date: '2026-11-02',
      recurrence_rule: 'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1',
    })
    expect(parseQuickAdd('Payroll last workday of every month', SUNDAY)).toMatchObject({
      due_date: '2026-10-30',
      recurrence_rule: RRULE.lastWorkday,
    })
    expect(describeDraft(parseQuickAdd('Gym every monday at 6pm', SUNDAY))).toMatch(
      /^Mon 26 October, 18:00 · /,
    )
  })

  it('keeps a plain weekly repeat on the start weekday', () => {
    expect(parseQuickAdd('Bins every week', SUNDAY)).toMatchObject({
      due_date: '2026-10-25',
      recurrence_rule: RRULE.weekly,
    })
  })

  it('does not read a count without "every" as a repeat', () => {
    expect(parseQuickAdd('3 days of rest', REF).recurrence_rule).toBeNull()
    expect(parseQuickAdd('2 weeks notice', REF).recurrence_rule).toBeNull()
  })

  it.each(['weekly', 'daily', 'monthly', 'yearly', 'annually'])(
    'keeps a #%s tag as the label, not a repeat',
    (tag) => {
      expect(parseQuickAdd(`review #${tag}`, REF)).toEqual({
        title: 'review',
        label: tag,
        due_date: null,
        due_time: null,
        recurrence_rule: null,
      })
    },
  )

  it('keeps a capture made only of a recurrence phrase as its own title', () => {
    expect(parseQuickAdd('every monday', REF)).toEqual({
      title: 'every monday',
      label: null,
      due_date: '2026-06-29',
      due_time: null,
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    expect(parseQuickAdd('every other tuesday #chores', REF)).toEqual({
      title: 'every other tuesday',
      label: 'chores',
      due_date: '2026-07-07',
      due_time: null,
      recurrence_rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU',
    })
  })

  it('keeps the whole capture as the title when only schedule words remain', () => {
    expect(parseQuickAdd('every monday at 9am', REF)).toMatchObject({
      title: 'every monday at 9am',
      due_time: '09:00',
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    })
    expect(parseQuickAdd('tomorrow', REF)).toMatchObject({
      title: 'tomorrow',
      due_date: '2026-06-26',
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

describe('quickAddInput', () => {
  it('sends the parsed fields with the resolved label id, never the tag text', () => {
    expect(quickAddInput(parseQuickAdd('standup 9am friday #work', REF), 7)).toEqual({
      title: 'standup',
      label_id: 7,
      due_date: '2026-06-26',
      due_time: '09:00',
      recurrence_rule: null,
    })
  })
})

describe('activeLabelToken', () => {
  it('finds the tag the caret sits in, capturing the partial', () => {
    expect(activeLabelToken('buy milk #gro', 13)).toEqual({ start: 9, query: 'gro' })
  })

  it('reports an empty query right after the #', () => {
    expect(activeLabelToken('buy milk #', 10)).toEqual({ start: 9, query: '' })
  })

  it('is null when the caret is past a finished tag or not in one', () => {
    expect(activeLabelToken('buy milk #gro ', 14)).toBeNull()
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

describe('labelSuggestions', () => {
  const home = makeLabel({ id: 1, name: 'Home' })
  const homework = makeLabel({ id: 2, name: 'Homework' })
  const gym = makeLabel({ id: 3, name: 'Gym' })
  const labels = [home, homework, gym]

  it('lists every label for an empty query, with no create row', () => {
    expect(labelSuggestions(labels, '')).toEqual(labels.map((label) => ({ type: 'label', label })))
  })

  it('matches case-insensitively by substring and offers to create the trimmed name', () => {
    expect(labelSuggestions(labels, ' OME ')).toEqual([
      { type: 'label', label: home },
      { type: 'label', label: homework },
      { type: 'create', name: 'OME' },
    ])
  })

  it('offers no create row once a label matches the name exactly', () => {
    expect(labelSuggestions(labels, 'home')).toEqual([
      { type: 'label', label: home },
      { type: 'label', label: homework },
    ])
  })

  it('offers only the create row when nothing matches', () => {
    expect(labelSuggestions(labels, 'Run')).toEqual([{ type: 'create', name: 'Run' }])
  })
})

describe('listboxStep', () => {
  it.each([
    ['ArrowDown', 0, { type: 'move', active: 1 }],
    ['ArrowDown', 2, { type: 'move', active: 0 }],
    ['ArrowUp', 0, { type: 'move', active: 2 }],
    ['ArrowUp', 2, { type: 'move', active: 1 }],
    ['Enter', 1, { type: 'choose', active: 1 }],
    ['Escape', 1, { type: 'dismiss' }],
  ])('%s from %i in three rows', (key, active, step) => {
    expect(listboxStep(key, active, 3)).toEqual(step)
  })

  it('ignores other keys and an empty list', () => {
    expect(listboxStep('a', 0, 3)).toBeNull()
    expect(listboxStep('ArrowDown', 0, 0)).toBeNull()
    expect(listboxStep('Enter', 0, 0)).toBeNull()
  })
})
