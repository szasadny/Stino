import { firstOccurrenceOnOrAfter } from './recurrence/first-occurrence'
import type { Task, TaskInput } from './types'

export interface ComposerDraft {
  title: string
  notes: string
  labelId: number | null
  date: string // '' ⇒ Inbox
  time: string // '' ⇒ untimed
  rule: string | null
}

export function emptyDraft(initial: Partial<ComposerDraft> = {}): ComposerDraft {
  return { title: '', notes: '', labelId: null, date: '', time: '', rule: null, ...initial }
}

export function taskToDraft(task: Task): ComposerDraft {
  return {
    title: task.title,
    notes: task.notes ?? '',
    labelId: task.label_id,
    date: task.due_date ?? '',
    time: task.due_time ?? '',
    rule: task.recurrence_rule,
  }
}

type Schedule = Pick<ComposerDraft, 'date' | 'rule'>

export function snapDate({ date, rule }: Schedule): string {
  return date && rule ? firstOccurrenceOnOrAfter(rule, date) : date
}

// Only the first repeat on an undated draft fills today, so a deliberately cleared date stays clear.
// That fill counts as a date edit: the picker follows it, so Monthly repeats on today's day.
export function dateForRule(draft: Schedule, rule: string | null, today: string): string {
  if (!draft.date && !draft.rule && rule) return today
  return snapDate({ date: draft.date, rule })
}

// An opened series whose stored date and rule disagree saves as it was unless one of them changed.
export function settleDate(draft: Schedule, opened: Schedule): string {
  const edited = draft.date !== opened.date || draft.rule !== opened.rule
  return edited ? snapDate(draft) : draft.date
}

// Drops time and rule when there's no date, because the backend rejects either without one.
export function draftToInput(draft: ComposerDraft): TaskInput {
  const date = draft.date || null
  const notes = draft.notes.trim()
  return {
    title: draft.title.trim(),
    notes: notes || null,
    label_id: draft.labelId,
    due_date: date,
    due_time: date && draft.time ? draft.time : null,
    recurrence_rule: date ? draft.rule : null,
  }
}
