import { describe, expect, it } from 'vitest'
import {
  dayCellLabel,
  dayTaskCount,
  deleteTasksTitle,
  pluralize,
  scheduledNotice,
  skippedRows,
  taskDateLabel,
  tasksDueToday,
} from './format'
import { INBOX, NOTHING_SCHEDULED, SCHEDULED_TODAY, SCHEDULED_TOMORROW } from './messages'

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

describe('deleteTasksTitle', () => {
  it.each([
    [1, 'Delete 1 task?'],
    [3, 'Delete 3 tasks?'],
  ])('counts %i selected tasks', (count, title) => {
    expect(deleteTasksTitle(count)).toBe(title)
  })
})

describe('tasksDueToday', () => {
  it.each([
    [0, '0 tasks due today'],
    [1, '1 task due today'],
    [2, '2 tasks due today'],
  ])('counts %i', (count, expected) => {
    expect(tasksDueToday(count)).toBe(expected)
  })
})

describe('dayCellLabel', () => {
  it.each([
    [1, 0, 'Monday, 1 June, 1 task'],
    [5, 0, 'Monday, 1 June, 5 tasks'],
    [5, 2, 'Monday, 1 June, 5 tasks, 2 more'],
  ])('labels %i tasks with %i hidden', (count, hidden, expected) => {
    expect(dayCellLabel('Monday, 1 June', count, hidden)).toBe(expected)
  })
})

describe('skippedRows', () => {
  it.each([
    [1, '1 row skipped (empty or invalid).'],
    [3, '3 rows skipped (empty or invalid).'],
  ])('counts %i skipped rows', (count, expected) => {
    expect(skippedRows(count)).toBe(expected)
  })
})

describe('taskDateLabel', () => {
  it('shows the short date for a scheduled task and Inbox otherwise', () => {
    expect(taskDateLabel({ due_date: '2026-06-24' }, 2026)).toBe('Wed 24 June')
    expect(taskDateLabel({ due_date: '2025-06-24' }, 2026)).toBe('Tue 24 June 2025')
    expect(taskDateLabel({ due_date: null }, 2026)).toBe(INBOX)
  })
})

describe('scheduledNotice', () => {
  const today = new Date(2026, 11, 30)

  it.each([
    ['2026-12-30', SCHEDULED_TODAY],
    ['2026-12-31', SCHEDULED_TOMORROW],
    ['2026-12-29', 'Scheduled for Tue 29 December'],
    ['2027-01-01', 'Scheduled for Fri 1 January 2027'],
  ])('reads %s as %j', (dueDate, expected) => {
    expect(scheduledNotice(dueDate, today)).toBe(expected)
  })
})
