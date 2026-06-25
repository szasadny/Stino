import { describe, expect, it } from 'vitest'
import { draftToInput, emptyDraft, taskToDraft } from './composer'
import type { Task } from './types'

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
