import { describe, expect, it } from 'vitest'
import { deleteLabelTitle, failureWithReason, SAVE_TASK_FAILED, toggleTaskLabel } from './messages'

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
