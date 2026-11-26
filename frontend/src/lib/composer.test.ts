import { describe, expect, it } from 'vitest'
import {
  dateForRule,
  draftToInput,
  emptyDraft,
  settleDate,
  snapDate,
  taskToDraft,
  type ComposerDraft,
} from './composer'
import {
  EMPTY_RECURRENCE,
  WORKDAYS,
  followStart,
  withFreq,
  type RecurrenceValue,
} from './recurrence/model'
import { buildRRule } from './recurrence/rrule-build'
import { REF_SUNDAY_ISO, REF_THURSDAY_ISO } from './test/factories'
import type { Task } from './types'

const THURSDAY = '2026-11-26'
const MID_MONTH = '2026-11-15'

const monthly: RecurrenceValue = { ...EMPTY_RECURRENCE, freq: 'monthly', monthday: 15 }
const weekly = (weekdays: RecurrenceValue['weekdays']): RecurrenceValue => ({
  ...EMPTY_RECURRENCE,
  freq: 'weekly',
  weekdays,
})
const LAST_DAY = { ...monthly, monthday: -1 }
const LAST_FRIDAY: RecurrenceValue = {
  ...monthly,
  monthlyMode: 'weekday',
  position: -1,
  monthWeekday: 'FR',
}
const FIRST_WORKDAY: RecurrenceValue = {
  ...monthly,
  monthlyMode: 'weekday',
  position: 1,
  monthWeekday: 'WD',
}
const LAST_WORKDAY: RecurrenceValue = {
  ...monthly,
  monthlyMode: 'weekday',
  position: -1,
  monthWeekday: 'WD',
}

interface Form {
  base: RecurrenceValue
  date: string
  rule: string | null
}

// Mirrors the form: the picker shows its base followed to the date; only a commit moves the date.
function open(base: RecurrenceValue, date: string): Form {
  return { base, date, rule: buildRRule(base) }
}

function typeDate(form: Form, date: string): Form {
  return { ...form, date, rule: buildRRule(followStart(form.base, date || null)) }
}

function commit(form: Form): Form {
  const date = snapDate(form)
  return date === form.date ? form : typeDate(form, date)
}

function editRule(form: Form, shown: RecurrenceValue): Form {
  const date = dateForRule(form, buildRRule(shown), REF_SUNDAY_ISO)
  const next = { base: shown, date, rule: buildRRule(shown) }
  return date === form.date ? next : typeDate(next, date)
}

describe('dateForRule', () => {
  const today = REF_SUNDAY_ISO

  it('starts an undated draft today when a repeat is chosen', () => {
    expect(dateForRule(emptyDraft(), 'FREQ=WEEKLY', today)).toBe(today)
  })

  it('keeps an existing date', () => {
    const draft = emptyDraft({ date: REF_THURSDAY_ISO })
    expect(dateForRule(draft, 'FREQ=DAILY', today)).toBe(REF_THURSDAY_ISO)
  })

  it('does not refill a date cleared on purpose while a repeat is set', () => {
    const cleared = emptyDraft({ date: '', rule: 'FREQ=WEEKLY' })
    expect(dateForRule(cleared, 'FREQ=DAILY', today)).toBe('')
  })

  it('fills nothing when the repeat stays off', () => {
    expect(dateForRule(emptyDraft(), null, today)).toBe('')
  })

  it('makes Monthly on an undated draft repeat on today, not day 1', () => {
    const monthly = withFreq(EMPTY_RECURRENCE, 'monthly', null)
    const date = dateForRule(emptyDraft(), buildRRule(monthly), today)
    expect(buildRRule(followStart(monthly, date))).toBe('FREQ=MONTHLY;BYMONTHDAY=25')
  })
})

describe('a date edit', () => {
  const mwf = weekly(['MO', 'WE', 'FR'])

  it('adds only the last typed weekday, since every follow starts from the base', () => {
    const opened = open(mwf, '2026-11-27')
    const sundays = ['2026-11-01', '2026-11-15'].reduce(typeDate, opened)
    expect(sundays.rule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR,SU')
    const tuesday = ['2026-11-01', '2026-11-17'].reduce(typeDate, opened)
    expect(tuesday.rule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,FR')
  })

  it('lets an added weekday follow the date until a chip edit makes it the base', () => {
    const tuesday = typeDate(open(mwf, '2026-11-27'), '2026-11-17')
    expect(typeDate(tuesday, THURSDAY).rule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,TH,FR')
    const edited = editRule(tuesday, weekly(['MO', 'TU', 'WE', 'TH', 'FR']))
    expect(typeDate(edited, '2026-11-21').rule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA')
  })

  it.each<[string, RecurrenceValue, string]>([
    ['the last day', LAST_DAY, '2026-11-30'],
    ['the last weekday', LAST_FRIDAY, '2026-11-27'],
    ['the first workday', FIRST_WORKDAY, '2026-12-01'],
    ['the last workday', LAST_WORKDAY, '2026-11-30'],
  ])('moves to the first occurrence of %s on or after it, only on commit', (_, value, first) => {
    const typed = typeDate(open(value, first), MID_MONTH)
    expect(typed).toEqual({ base: value, date: MID_MONTH, rule: buildRRule(value) })
    expect(commit(typed)).toEqual({ ...typed, date: first })
  })

  it('keeps a date its followed rule now generates', () => {
    expect(commit(typeDate(open(weekly(['MO', 'TU']), '2026-11-30'), THURSDAY))).toMatchObject({
      date: THURSDAY,
      rule: 'FREQ=WEEKLY;BYDAY=MO,TU,TH',
    })
    expect(commit(typeDate(open(monthly, MID_MONTH), THURSDAY))).toMatchObject({
      date: THURSDAY,
      rule: 'FREQ=MONTHLY;BYMONTHDAY=26',
    })
  })

  it('follows and snaps nothing without a date', () => {
    expect(commit(typeDate(open(LAST_DAY, '2026-11-30'), ''))).toMatchObject({
      date: '',
      rule: buildRRule(LAST_DAY),
    })
  })
})

describe('a rule edit', () => {
  const onThursday = (value: RecurrenceValue) => open(value, THURSDAY)

  it('moves the date to the next chosen weekday when its own is switched off', () => {
    expect(editRule(onThursday(weekly(['MO', 'TH'])), weekly(['MO'])).date).toBe('2026-11-30')
  })

  it('keeps the date when every weekday is switched off', () => {
    expect(editRule(onThursday(weekly(['TH'])), weekly([])).date).toBe(THURSDAY)
  })

  it.each([
    [20, '2026-11-20'],
    [10, '2026-12-10'],
    [-1, '2026-11-30'],
  ])('moves the date to the next day %i of a month', (monthday, first) => {
    expect(editRule(open(monthly, MID_MONTH), { ...monthly, monthday }).date).toBe(first)
  })

  it('keeps a date the new rule already generates', () => {
    expect(editRule(onThursday(EMPTY_RECURRENCE), weekly([])).date).toBe(THURSDAY)
    expect(editRule(open(weekly([]), MID_MONTH), monthly).date).toBe(MID_MONTH)
  })

  it('drops an end date the moved date passed, and brings it back when the date returns', () => {
    const ending = { ...monthly, until: '2026-11-20' }
    const lastDay = editRule(open(ending, MID_MONTH), { ...ending, monthday: -1 })
    expect(lastDay).toMatchObject({ date: '2026-11-30', rule: 'FREQ=MONTHLY;BYMONTHDAY=-1' })
    expect(typeDate(lastDay, MID_MONTH).rule).toBe('FREQ=MONTHLY;BYMONTHDAY=-1;UNTIL=20261120')
  })

  it('never moves the date for a rule the picker cannot model', () => {
    const rule = 'FREQ=MONTHLY;BYMONTHDAY=1,15'
    expect(dateForRule({ date: THURSDAY, rule }, rule, REF_SUNDAY_ISO)).toBe(THURSDAY)
    expect(snapDate({ date: THURSDAY, rule })).toBe(THURSDAY)
  })
})

describe('settleDate', () => {
  const opened = emptyDraft({ title: 'gym', date: THURSDAY, rule: 'FREQ=WEEKLY;BYDAY=MO' })

  it('leaves an unedited draft alone, even when its stored date and rule disagree', () => {
    const retimed: ComposerDraft = { ...opened, title: 'gym!', time: '07:00' }
    expect(settleDate(retimed, opened)).toBe(THURSDAY)
  })

  it('snaps a draft whose date or rule was edited', () => {
    expect(settleDate({ ...opened, date: MID_MONTH }, opened)).toBe('2026-11-16')
    expect(settleDate({ ...opened, rule: 'FREQ=WEEKLY;BYDAY=FR' }, opened)).toBe('2026-11-27')
  })

  it('leaves a draft without a date or a rule alone', () => {
    expect(settleDate({ ...opened, date: '' }, opened)).toBe('')
    expect(settleDate({ ...opened, rule: null }, opened)).toBe(THURSDAY)
  })
})

describe('date and rule settle in one round', () => {
  const shapes: [string, RecurrenceValue][] = [
    ['daily', { ...EMPTY_RECURRENCE, freq: 'daily' }],
    ['yearly', { ...EMPTY_RECURRENCE, freq: 'yearly' }],
    ['weekly', weekly([])],
    ['one weekday', weekly(['MO'])],
    ['several weekdays', weekly(['MO', 'WE'])],
    ['workdays', weekly([...WORKDAYS])],
    ['every N days', { ...EMPTY_RECURRENCE, freq: 'custom', unit: 'day' }],
    ['every N weeks', { ...weekly(['FR']), freq: 'custom', unit: 'week', interval: 3 }],
    ['every N months', { ...monthly, freq: 'custom', unit: 'month', interval: 2 }],
    ['a day of the month', monthly],
    ['day 31', { ...monthly, monthday: 31 }],
    ['the last day', LAST_DAY],
    ['an Nth weekday', { ...monthly, monthlyMode: 'weekday', position: 2, monthWeekday: 'TU' }],
    ['a fifth weekday', { ...monthly, monthlyMode: 'weekday', position: 5, monthWeekday: 'SA' }],
    ['the last weekday', LAST_FRIDAY],
    ['the first workday', FIRST_WORKDAY],
    ['the last workday', LAST_WORKDAY],
  ]
  const dates = [MID_MONTH, THURSDAY, '2026-10-31', '2027-02-28']

  it.each(shapes)('a committed date edit of %s is stable on a second commit', (_, value) => {
    for (const date of dates) {
      const once = commit(typeDate(open(value, '2026-11-02'), date))
      expect(commit(once)).toEqual(once)
      expect(snapDate(once)).toBe(once.date)
    }
  })

  it.each(shapes)('the date a rule edit to %s picks leaves that rule alone', (_, value) => {
    for (const date of dates) {
      const edited = editRule(open(EMPTY_RECURRENCE, date), value)
      expect(edited.rule).toBe(buildRRule(value))
      expect(commit(edited)).toEqual(edited)
    }
  })
})

describe('draftToInput', () => {
  it('trims the title and collapses empty notes to null', () => {
    const input = draftToInput(emptyDraft({ title: '  buy bread  ', notes: '   ' }))
    expect(input.title).toBe('buy bread')
    expect(input.notes).toBeNull()
  })

  it('keeps an unscheduled draft as a clean Inbox capture', () => {
    const input = draftToInput(emptyDraft({ title: 'idea', labelId: 3 }))
    expect(input).toEqual({
      title: 'idea',
      notes: null,
      label_id: 3,
      due_date: null,
      due_time: null,
      recurrence_rule: null,
    })
  })

  it('drops a time and a rule when there is no date (the backend rejects either)', () => {
    const input = draftToInput(emptyDraft({ title: 'x', time: '09:00', rule: 'FREQ=DAILY' }))
    expect(input.due_time).toBeNull()
    expect(input.recurrence_rule).toBeNull()
  })

  it('keeps the time and rule once a date is set', () => {
    const input = draftToInput(
      emptyDraft({ title: 'standup', date: '2026-06-26', time: '09:00', rule: 'FREQ=DAILY' }),
    )
    expect(input.due_date).toBe('2026-06-26')
    expect(input.due_time).toBe('09:00')
    expect(input.recurrence_rule).toBe('FREQ=DAILY')
  })
})

describe('taskToDraft', () => {
  it('maps an existing task onto editable fields, nulls to empty strings', () => {
    const task: Task = {
      id: 1,
      title: 'call mum',
      notes: null,
      label_id: 2,
      due_date: '2026-06-26',
      due_time: null,
      recurrence_rule: null,
      occurrence_date: '2026-06-26',
      sort_order: 0,
      completed: false,
    }
    expect(taskToDraft(task)).toEqual({
      title: 'call mum',
      notes: '',
      labelId: 2,
      date: '2026-06-26',
      time: '',
      rule: null,
    })
  })

  it('round-trips back into the same TaskInput shape', () => {
    const task: Task = {
      id: 5,
      title: 'review',
      notes: 'with the team',
      label_id: null,
      due_date: '2026-07-01',
      due_time: '14:30',
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=WE',
      occurrence_date: '2026-07-01',
      sort_order: 3,
      completed: false,
    }
    expect(draftToInput(taskToDraft(task))).toEqual({
      title: 'review',
      notes: 'with the team',
      label_id: null,
      due_date: '2026-07-01',
      due_time: '14:30',
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=WE',
    })
  })
})
