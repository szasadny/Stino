import { describe, expect, it } from 'vitest'
import { dayTaskCount, pluralize } from './format'
import { NOTHING_SCHEDULED } from './messages'

describe('pluralize', () => {
  it.each([
    [0, 'task', '0 tasks'],
    [1, 'task', '1 task'],
    [2, 'week', '2 weeks'],
  ])('counts %i %s as "%s"', (count, noun, expected) => {
    expect(pluralize(count, noun)).toBe(expected)
  })
})

describe('dayTaskCount', () => {
  it.each([
    [0, NOTHING_SCHEDULED],
    [1, '1 task'],
    [3, '3 tasks'],
  ])('summarises %i as "%s"', (count, expected) => {
    expect(dayTaskCount(count)).toBe(expected)
  })
})
