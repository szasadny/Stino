import { describe, expect, it } from 'vitest'
import {
  buildRRule,
  EMPTY_RECURRENCE,
  parseRecurrencePhrase,
  parseRRule,
  summarize,
  summarizeRule,
  WORKDAYS,
  type RecurrenceValue,
} from './recurrence'

const value = (partial: Partial<RecurrenceValue>): RecurrenceValue => ({
  ...EMPTY_RECURRENCE,
  ...partial,
})

describe('buildRRule', () => {
  it('returns null when the task does not repeat', () => {
    expect(buildRRule(value({ freq: 'none' }))).toBeNull()
  })

  it('builds daily, weekly and yearly rules', () => {
    expect(buildRRule(value({ freq: 'daily' }))).toBe('FREQ=DAILY')
    expect(buildRRule(value({ freq: 'weekly' }))).toBe('FREQ=WEEKLY')
    expect(buildRRule(value({ freq: 'yearly' }))).toBe('FREQ=YEARLY')
  })

  it('orders weekly BYDAY Monday-first regardless of input order', () => {
    expect(buildRRule(value({ freq: 'weekly', weekdays: ['WE', 'MO'] }))).toBe(
      'FREQ=WEEKLY;BYDAY=MO,WE',
    )
  })

  it('maps custom intervals to DAILY/WEEKLY with INTERVAL', () => {
    expect(buildRRule(value({ freq: 'custom', unit: 'day', interval: 3 }))).toBe(
      'FREQ=DAILY;INTERVAL=3',
    )
    expect(buildRRule(value({ freq: 'custom', unit: 'week', interval: 2 }))).toBe(
      'FREQ=WEEKLY;INTERVAL=2',
    )
  })

  it('keeps custom every-N-weeks weekdays as a Monday-first, deduped BYDAY', () => {
    const weeks = (partial: Partial<RecurrenceValue>) =>
      buildRRule(value({ freq: 'custom', unit: 'week', interval: 2, ...partial }))
    expect(weeks({ weekdays: ['MO', 'WE'] })).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')
    expect(weeks({ weekdays: ['WE', 'MO', 'WE'] })).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')
    // No weekday chosen ⇒ repeats on the start weekday.
    expect(weeks({ weekdays: [] })).toBe('FREQ=WEEKLY;INTERVAL=2')
    expect(weeks({ weekdays: ['MO', 'WE'], until: '2026-12-31' })).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231',
    )
  })

  it('never emits BYDAY for custom days or months, whatever weekdays linger', () => {
    expect(buildRRule(value({ freq: 'custom', unit: 'day', interval: 3, weekdays: ['MO'] }))).toBe(
      'FREQ=DAILY;INTERVAL=3',
    )
    expect(
      buildRRule(
        value({ freq: 'custom', unit: 'month', interval: 2, monthday: 15, weekdays: ['MO'] }),
      ),
    ).toBe('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15')
  })

  it('builds custom every-N-months rules over every monthly shape', () => {
    const months = (partial: Partial<RecurrenceValue>) =>
      buildRRule(value({ freq: 'custom', unit: 'month', ...partial }))
    expect(months({ interval: 2, monthlyMode: 'monthday', monthday: 15 })).toBe(
      'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15',
    )
    expect(months({ interval: 6, monthlyMode: 'monthday', monthday: -1 })).toBe(
      'FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1',
    )
    expect(months({ interval: 2, monthlyMode: 'weekday', position: 1, monthWeekday: 'MO' })).toBe(
      'FREQ=MONTHLY;INTERVAL=2;BYDAY=MO;BYSETPOS=1',
    )
    expect(months({ interval: 3, monthlyMode: 'weekday', position: -1, monthWeekday: 'WD' })).toBe(
      'FREQ=MONTHLY;INTERVAL=3;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
    )
    expect(
      months({
        interval: 4,
        monthlyMode: 'monthday',
        monthday: 31,
        until: '2027-06-30',
      }),
    ).toBe('FREQ=MONTHLY;INTERVAL=4;BYMONTHDAY=31;UNTIL=20270630')
  })

  it('floors a fractional interval to at least 1', () => {
    expect(buildRRule(value({ freq: 'custom', unit: 'day', interval: 0 }))).toBe(
      'FREQ=DAILY;INTERVAL=1',
    )
  })

  it('builds monthly rules by date-of-month (incl. last day)', () => {
    expect(buildRRule(value({ freq: 'monthly', monthlyMode: 'monthday', monthday: 15 }))).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=15',
    )
    expect(buildRRule(value({ freq: 'monthly', monthlyMode: 'monthday', monthday: -1 }))).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=-1',
    )
  })

  it('appends an UNTIL end date as the bare-date form, on any repeating rule', () => {
    expect(buildRRule(value({ freq: 'daily', until: '2026-06-30' }))).toBe(
      'FREQ=DAILY;UNTIL=20260630',
    )
    expect(buildRRule(value({ freq: 'weekly', weekdays: ['MO'], until: '2026-12-31' }))).toBe(
      'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231',
    )
    // No end date ⇒ no UNTIL; an end date on a non-repeating rule is ignored.
    expect(buildRRule(value({ freq: 'daily', until: null }))).toBe('FREQ=DAILY')
    expect(buildRRule(value({ freq: 'none', until: '2026-06-30' }))).toBeNull()
  })

  it('builds monthly rules by ordinal weekday (incl. fifth and last)', () => {
    expect(
      buildRRule(
        value({ freq: 'monthly', monthlyMode: 'weekday', position: 1, monthWeekday: 'MO' }),
      ),
    ).toBe('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1')
    expect(
      buildRRule(
        value({ freq: 'monthly', monthlyMode: 'weekday', position: -1, monthWeekday: 'FR' }),
      ),
    ).toBe('FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1')
    expect(
      buildRRule(
        value({ freq: 'monthly', monthlyMode: 'weekday', position: 5, monthWeekday: 'MO' }),
      ),
    ).toBe('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=5')
  })

  it('builds monthly rules by first/last workday (the Mon–Fri set)', () => {
    expect(
      buildRRule(
        value({ freq: 'monthly', monthlyMode: 'weekday', position: 1, monthWeekday: 'WD' }),
      ),
    ).toBe('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1')
    expect(
      buildRRule(
        value({ freq: 'monthly', monthlyMode: 'weekday', position: -1, monthWeekday: 'WD' }),
      ),
    ).toBe('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1')
  })
})

describe('parseRRule', () => {
  it('treats null/unmodeled rules as "none"', () => {
    expect(parseRRule(null).freq).toBe('none')
    expect(parseRRule('FREQ=MONTHLY').freq).toBe('none')
  })

  it('parses the modeled shapes back into the picker form', () => {
    expect(parseRRule('FREQ=DAILY').freq).toBe('daily')
    expect(parseRRule('FREQ=DAILY;INTERVAL=3')).toMatchObject({
      freq: 'custom',
      unit: 'day',
      interval: 3,
    })
    expect(parseRRule('FREQ=WEEKLY;BYDAY=MO,WE')).toMatchObject({
      freq: 'weekly',
      weekdays: ['MO', 'WE'],
    })
    expect(parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU')).toMatchObject({
      freq: 'custom',
      unit: 'week',
      interval: 2,
      weekdays: ['TU'],
    })
    // The bug case: an imported every-2-weeks rule keeps both its days.
    expect(parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO,WE;UNTIL=20261231')).toMatchObject({
      freq: 'custom',
      unit: 'week',
      interval: 2,
      weekdays: ['MO', 'WE'],
      until: '2026-12-31',
    })
  })

  it('parses a plain yearly rule, and leaves shaped yearly rules as "none"', () => {
    expect(parseRRule('FREQ=YEARLY').freq).toBe('yearly')
    expect(parseRRule('FREQ=YEARLY;INTERVAL=1').freq).toBe('yearly')
    // Yearly with an interval or BY… parts isn't modeled — kept read-only.
    expect(parseRRule('FREQ=YEARLY;INTERVAL=2').freq).toBe('none')
    expect(parseRRule('FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=24').freq).toBe('none')
    expect(parseRRule('FREQ=YEARLY;BYDAY=MO;BYSETPOS=1').freq).toBe('none')
    expect(parseRRule('FREQ=YEARLY;BYWEEKNO=20').freq).toBe('none')
    expect(parseRRule('FREQ=YEARLY;BYYEARDAY=100').freq).toBe('none')
  })

  it('parses monthly shapes, and leaves unmodeled monthly as "none"', () => {
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=15')).toMatchObject({
      freq: 'monthly',
      monthlyMode: 'monthday',
      monthday: 15,
    })
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=-1')).toMatchObject({
      freq: 'monthly',
      monthlyMode: 'monthday',
      monthday: -1,
    })
    expect(parseRRule('FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1')).toMatchObject({
      freq: 'monthly',
      monthlyMode: 'weekday',
      position: 1,
      monthWeekday: 'MO',
    })
    // RFC-5545 also allows the position fused into BYDAY (e.g. an import).
    expect(parseRRule('FREQ=MONTHLY;BYDAY=-1FR')).toMatchObject({
      freq: 'monthly',
      monthlyMode: 'weekday',
      position: -1,
      monthWeekday: 'FR',
    })
    // First/last workday: the full Mon–Fri BYDAY set + a BYSETPOS.
    expect(parseRRule('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1')).toMatchObject({
      freq: 'monthly',
      monthlyMode: 'weekday',
      position: 1,
      monthWeekday: 'WD',
    })
    expect(parseRRule('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1')).toMatchObject({
      freq: 'monthly',
      monthlyMode: 'weekday',
      position: -1,
      monthWeekday: 'WD',
    })
    // Weekday order in the stored rule doesn't matter — still the workday set.
    expect(parseRRule('FREQ=MONTHLY;BYDAY=FR,MO,WE,TU,TH;BYSETPOS=-1')).toMatchObject({
      monthWeekday: 'WD',
      position: -1,
    })
    // A monthly rule we don't model stays read-only.
    expect(parseRRule('FREQ=MONTHLY;BYMONTHDAY=1,15').freq).toBe('none')
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1,15').freq).toBe('none')
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=2').freq).toBe('none')
    // The weekend pair isn't the workday set, so it stays unmodeled.
    expect(parseRRule('FREQ=MONTHLY;BYDAY=SA,SU;BYSETPOS=-1').freq).toBe('none')
  })

  it('parses interval-monthly shapes as custom every-N-months', () => {
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15')).toMatchObject({
      freq: 'custom',
      unit: 'month',
      interval: 2,
      monthlyMode: 'monthday',
      monthday: 15,
    })
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=3;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1')).toMatchObject({
      freq: 'custom',
      unit: 'month',
      interval: 3,
      monthlyMode: 'weekday',
      position: -1,
      monthWeekday: 'WD',
    })
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=2;BYDAY=2TU')).toMatchObject({
      freq: 'custom',
      unit: 'month',
      interval: 2,
      monthlyMode: 'weekday',
      position: 2,
      monthWeekday: 'TU',
    })
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=-1;UNTIL=20271231')).toMatchObject({
      freq: 'custom',
      unit: 'month',
      interval: 6,
      monthday: -1,
      until: '2027-12-31',
    })
  })

  it('keeps INTERVAL=1 monthly rules in the Monthly mode', () => {
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15')).toMatchObject({
      freq: 'monthly',
      monthday: 15,
    })
    // A custom "every 1 month" builds INTERVAL=1, which reads back as Monthly.
    const rule = buildRRule(
      value({ freq: 'custom', unit: 'month', interval: 1, monthlyMode: 'monthday', monthday: 15 }),
    )
    expect(rule).toBe('FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=15')
    expect(parseRRule(rule).freq).toBe('monthly')
  })

  it('carries an UNTIL end date onto a modeled rule, accepting both date and date-time forms', () => {
    // TickTick's bare DATE form (what the import stores).
    expect(parseRRule('FREQ=DAILY;UNTIL=20260630')).toMatchObject({
      freq: 'daily',
      until: '2026-06-30',
    })
    // The UTC DATE-TIME form the backend normalizes to.
    expect(
      parseRRule('FREQ=WEEKLY;WKST=MO;UNTIL=20260520T000000Z;INTERVAL=1;BYDAY=WE'),
    ).toMatchObject({ freq: 'weekly', weekdays: ['WE'], until: '2026-05-20' })
    // No UNTIL ⇒ never ends.
    expect(parseRRule('FREQ=DAILY').until).toBeNull()
  })

  it('round-trips the modeled rules through build → parse → build', () => {
    for (const rule of [
      'FREQ=DAILY',
      'FREQ=WEEKLY',
      'FREQ=WEEKLY;BYDAY=MO,WE',
      'FREQ=DAILY;INTERVAL=3',
      'FREQ=WEEKLY;INTERVAL=2',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
      'FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,TU,WE,TH,FR',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SU;UNTIL=20261231',
      'FREQ=WEEKLY;BYDAY=MO',
      'FREQ=WEEKLY;BYDAY=SU',
      'FREQ=MONTHLY;BYMONTHDAY=15',
      'FREQ=MONTHLY;BYMONTHDAY=-1',
      'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1',
      'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1',
      'FREQ=MONTHLY;BYDAY=WE;BYSETPOS=5',
      'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1',
      'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
      'FREQ=YEARLY',
      'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15',
      'FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1',
      'FREQ=MONTHLY;INTERVAL=2;BYDAY=MO;BYSETPOS=1',
      'FREQ=MONTHLY;INTERVAL=4;BYDAY=FR;BYSETPOS=-1',
      'FREQ=MONTHLY;INTERVAL=2;BYDAY=WE;BYSETPOS=5',
      'FREQ=MONTHLY;INTERVAL=3;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1',
      'FREQ=MONTHLY;INTERVAL=3;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
      'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31;UNTIL=20271231',
    ]) {
      expect(buildRRule(parseRRule(rule))).toBe(rule)
    }
  })
})

describe('summarize', () => {
  it('describes each shape in plain words', () => {
    expect(summarize(value({ freq: 'none' }))).toBe('Does not repeat')
    expect(summarize(value({ freq: 'daily' }))).toBe('Every day')
    expect(summarize(value({ freq: 'weekly', weekdays: ['WE', 'MO'] }))).toBe('Weekly on Mon, Wed')
    expect(summarize(value({ freq: 'weekly' }))).toBe('Every week')
    // The full Mon–Fri set reads as the cleaner "Every weekday".
    expect(summarize(value({ freq: 'weekly', weekdays: ['FR', 'MO', 'TU', 'TH', 'WE'] }))).toBe(
      'Every weekday',
    )
    expect(summarize(value({ freq: 'yearly' }))).toBe('Every year')
    expect(summarize(value({ freq: 'custom', unit: 'day', interval: 1 }))).toBe('Every day')
    expect(summarize(value({ freq: 'custom', unit: 'week', interval: 2 }))).toBe('Every 2 weeks')
    expect(
      summarize(value({ freq: 'custom', unit: 'week', interval: 2, weekdays: ['WE', 'MO'] })),
    ).toBe('Every 2 weeks on Mon, Wed')
    expect(
      summarize(value({ freq: 'custom', unit: 'week', interval: 3, weekdays: [...WORKDAYS] })),
    ).toBe('Every 3 weeks on weekdays')
    expect(summarizeRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231')).toBe(
      'Every 2 weeks on Mon, Wed until Thu 31 December',
    )
  })

  it('describes monthly shapes', () => {
    expect(summarize(value({ freq: 'monthly', monthlyMode: 'monthday', monthday: 15 }))).toBe(
      'Monthly on day 15',
    )
    expect(summarize(value({ freq: 'monthly', monthlyMode: 'monthday', monthday: -1 }))).toBe(
      'Monthly on the last day',
    )
    expect(
      summarize(
        value({ freq: 'monthly', monthlyMode: 'weekday', position: 1, monthWeekday: 'MO' }),
      ),
    ).toBe('Monthly on the first Mon')
    expect(
      summarize(
        value({ freq: 'monthly', monthlyMode: 'weekday', position: -1, monthWeekday: 'FR' }),
      ),
    ).toBe('Monthly on the last Fri')
    expect(
      summarize(
        value({ freq: 'monthly', monthlyMode: 'weekday', position: 1, monthWeekday: 'WD' }),
      ),
    ).toBe('Monthly on the first workday')
    expect(
      summarize(
        value({ freq: 'monthly', monthlyMode: 'weekday', position: -1, monthWeekday: 'WD' }),
      ),
    ).toBe('Monthly on the last workday')
  })

  it('describes custom every-N-months in the monthly wording', () => {
    const months = (partial: Partial<RecurrenceValue>) =>
      summarize(value({ freq: 'custom', unit: 'month', ...partial }))
    expect(months({ interval: 2, monthlyMode: 'monthday', monthday: 15 })).toBe(
      'Every 2 months on day 15',
    )
    expect(months({ interval: 6, monthlyMode: 'monthday', monthday: -1 })).toBe(
      'Every 6 months on the last day',
    )
    expect(months({ interval: 3, monthlyMode: 'weekday', position: -1, monthWeekday: 'WD' })).toBe(
      'Every 3 months on the last workday',
    )
    expect(months({ interval: 2, monthlyMode: 'weekday', position: 1, monthWeekday: 'MO' })).toBe(
      'Every 2 months on the first Mon',
    )
    // Interval 1 drops the count, like "Every day" / "Every week".
    expect(months({ interval: 1, monthlyMode: 'monthday', monthday: 15 })).toBe(
      'Every month on day 15',
    )
    expect(summarizeRule('FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15;UNTIL=20261231')).toBe(
      'Every 2 months on day 15 until Thu 31 December',
    )
  })

  it('appends the end date when a rule has an UNTIL', () => {
    expect(summarize(value({ freq: 'daily', until: '2026-06-30' }))).toBe(
      'Every day until Tue 30 June',
    )
    expect(summarizeRule('FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231')).toBe(
      'Weekly on Mon until Thu 31 December',
    )
  })

  it('summarizes straight from a stored rule', () => {
    expect(summarizeRule('FREQ=WEEKLY;BYDAY=MO,WE')).toBe('Weekly on Mon, Wed')
  })
})

describe('parseRecurrencePhrase', () => {
  it('recognizes monthly phrases in both shapes and orders', () => {
    const cases: [string, string][] = [
      ['the 15th of every month', 'FREQ=MONTHLY;BYMONTHDAY=15'],
      ['monthly on the 15th', 'FREQ=MONTHLY;BYMONTHDAY=15'],
      ['the first day of every month', 'FREQ=MONTHLY;BYMONTHDAY=1'],
      ['the last day of every month', 'FREQ=MONTHLY;BYMONTHDAY=-1'],
      ['every month on the last day', 'FREQ=MONTHLY;BYMONTHDAY=-1'],
      ['the first Monday of every month', 'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1'],
      ['the second Tuesday of each month', 'FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2'],
      ['the last Friday of every month', 'FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1'],
      ['the fifth Wednesday of every month', 'FREQ=MONTHLY;BYDAY=WE;BYSETPOS=5'],
      ['every month on the first monday', 'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1'],
      ['the first workday of every month', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1'],
      ['the last work day of each month', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'],
      ['the last business day of the month', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'],
      ['every month on the last workday', 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'],
    ]
    for (const [text, rule] of cases) {
      expect(parseRecurrencePhrase(text)?.rule).toBe(rule)
    }
  })

  it('recognizes weekly and simple phrases', () => {
    expect(parseRecurrencePhrase('first day of every week')?.rule).toBe('FREQ=WEEKLY;BYDAY=MO')
    expect(parseRecurrencePhrase('last day of every week')?.rule).toBe('FREQ=WEEKLY;BYDAY=SU')
    expect(parseRecurrencePhrase('every monday')?.rule).toBe('FREQ=WEEKLY;BYDAY=MO')
    expect(parseRecurrencePhrase('every weekday')?.rule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    expect(parseRecurrencePhrase('every workday')?.rule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')
    expect(parseRecurrencePhrase('every business day')?.rule).toBe(
      'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    )
    expect(parseRecurrencePhrase('daily')?.rule).toBe('FREQ=DAILY')
    expect(parseRecurrencePhrase('every week')?.rule).toBe('FREQ=WEEKLY')
  })

  it('recognizes yearly phrases', () => {
    expect(parseRecurrencePhrase('every year')?.rule).toBe('FREQ=YEARLY')
    expect(parseRecurrencePhrase('yearly')?.rule).toBe('FREQ=YEARLY')
    expect(parseRecurrencePhrase('annually')?.rule).toBe('FREQ=YEARLY')
    expect(parseRecurrencePhrase('renew insurance every year')?.matched).toBe('every year')
  })

  it('returns the matched substring so the caller can strip it', () => {
    const m = parseRecurrencePhrase('team sync the first Monday of every month')
    expect(m?.matched).toBe('the first Monday of every month')
  })

  it('is null for text without a recurrence phrase', () => {
    expect(parseRecurrencePhrase('buy bread')).toBeNull()
    expect(parseRecurrencePhrase('call mum tomorrow')).toBeNull()
  })
})
