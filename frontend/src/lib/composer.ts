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

// Only the first repeat on an undated draft fills today, so a deliberately cleared date stays clear.
export function dateForRule(
  draft: Pick<ComposerDraft, 'date' | 'rule'>,
  rule: string | null,
  today: string,
): string {
  return !draft.date && !draft.rule && rule ? today : draft.date
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
