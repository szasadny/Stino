import { describe, expect, it } from 'vitest'
import {
  completedToast,
  deleteCount,
  deleteLabelTitle,
  failureWithReason,
  hideDayLabel,
  moreTasks,
  moveSectionLabel,
  noSearchMatch,
  openDayLabel,
  openTaskPillLabel,
  periodStepLabel,
  SAVE_TASK_FAILED,
  schedulingFor,
  selectedCount,
  tasksOnDayLabel,
  toggleTaskLabel,
} from './messages'

describe('delete confirmation titles', () => {
  it('quotes the label name', () => {
    expect(deleteLabelTitle('Work')).toBe('Delete “Work”?')
  })
})

describe('toggleTaskLabel', () => {
  it('quotes the title with curly quotes', () => {
    expect(toggleTaskLabel('Gym', false)).toBe('Mark “Gym” as done')
  })
})

describe('openTaskPillLabel', () => {
  it.each([
    ['Gym', null, false, 'Gym'],
    ['Gym', '09:00', false, 'Gym, 09:00'],
    ['Gym', '09:00', true, 'Gym, 09:00, drag to move to another day'],
    ['Gym', null, true, 'Gym, drag to move to another day'],
  ])('names %s at %s (draggable %s)', (title, time, draggable, expected) => {
    expect(openTaskPillLabel(title, time, draggable)).toBe(expected)
  })
})

describe('periodStepLabel', () => {
  it.each([
    ['month', -1, 'Previous month'],
    ['week', 1, 'Next week'],
  ] as const)('steps a %s by %i', (unit, step, expected) => {
    expect(periodStepLabel(unit, step)).toBe(expected)
  })
})

describe('parameterised labels', () => {
  it.each([
    [moreTasks(3), '3 more'],
    [selectedCount(2), '2 selected'],
    [deleteCount(4), 'Delete 4'],
    [openDayLabel('Monday, 1 June'), 'Open Monday, 1 June'],
    [hideDayLabel('Monday, 1 June'), 'Hide Monday, 1 June'],
    [tasksOnDayLabel('Monday, 1 June'), 'Tasks on Monday, 1 June'],
    [moveSectionLabel('Work', 'up'), 'Move Work up'],
    [completedToast('Gym'), 'Completed “Gym”'],
    [schedulingFor('Mon 1 Jun'), 'Scheduling for Mon 1 Jun'],
    [noSearchMatch('gym'), 'No tasks match “gym”.'],
  ])('reads %j', (actual, expected) => {
    expect(actual).toBe(expected)
  })
})

describe('failureWithReason', () => {
  it.each([
    ['unknown label', 'Couldn’t save the task: unknown label.'],
    [
      'that occurrence has already been moved.',
      'Couldn’t save the task: that occurrence has already been moved.',
    ],
    ['is this a date?', 'Couldn’t save the task: is this a date?'],
    ['try again!', 'Couldn’t save the task: try again!'],
    ['still going…', 'Couldn’t save the task: still going…'],
  ])('joins %j into one sentence', (reason, expected) => {
    expect(failureWithReason(SAVE_TASK_FAILED, reason)).toBe(expected)
  })

  it('keeps an action message without a final period intact', () => {
    expect(failureWithReason('Couldn’t save', 'not found')).toBe('Couldn’t save: not found.')
  })
})
