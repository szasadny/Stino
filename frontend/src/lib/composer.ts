import type { TaskInput } from './api'
import type { Task } from './types'

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

/** Drops time and rule when there's no date — the backend rejects either without one. */
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
