import { describe, expect, it } from 'vitest'
import { ORDINAL_WORDS, PHRASE_RULES, WEEKDAY_WORDS } from './phrase-grammar'

const firstRule = (text: string) => PHRASE_RULES.find(({ re }) => re.test(text))

describe('phrase vocabulary', () => {
  it('maps ordinal words and their numeric forms to the same position', () => {
    expect(ORDINAL_WORDS.first).toBe(ORDINAL_WORDS['1st'])
    expect(ORDINAL_WORDS.fifth).toBe(5)
    expect(ORDINAL_WORDS.last).toBe(-1)
  })

  it('maps every weekday spelling to its RRULE code', () => {
    expect([WEEKDAY_WORDS.monday, WEEKDAY_WORDS.mon]).toEqual(['MO', 'MO'])
    expect([WEEKDAY_WORDS.thursday, WEEKDAY_WORDS.thurs, WEEKDAY_WORDS.thu]).toEqual([
      'TH',
      'TH',
      'TH',
    ])
  })
})

describe('PHRASE_RULES', () => {
  it.each([
    ['the second Tuesday of each month', 'monthlyWeekday'],
    ['every month on the last workday', 'monthlyWorkday'],
    ['the last day of every month', 'monthlyEdgeDay'],
    ['the 15th of every month', 'monthlyDay'],
    ['last day of every week', 'weekEdgeDay'],
    ['every business day', 'workweek'],
    ['every other tuesday', 'weekly'],
    ['every 3 days', 'daily'],
    ['annually', 'yearly'],
    ['every month', 'monthly'],
  ])('matches "%s" first with the %s rule', (text, kind) => {
    expect(firstRule(text)?.kind).toBe(kind)
  })

  it('captures the parts of a phrase in named groups', () => {
    const text = 'every 2 months on the first monday'
    const groups = firstRule(text)?.re.exec(text)?.groups
    expect(groups).toMatchObject({ count: '2', ordinal: 'first', weekday: 'monday' })
  })

  it('needs "the" or a suffix before a bare day number', () => {
    expect(firstRule('buy 2 every month')?.kind).toBe('monthly')
  })
})
