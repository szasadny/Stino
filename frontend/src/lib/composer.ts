// Pure task-editor data layer. `draftToInput` mirrors backend date requirements.
import type { TaskInput } from './api'
import type { Task } from './types'

export interface ComposerDraft {
  title: string
  notes: string
  labelId: number | null
  date: string // 'YYYY-MM-DD' local, or '' ⇒ unscheduled (stays in the Inbox)
  time: string // 'HH:MM' local, or '' ⇒ untimed
  rule: string | null // RRULE, or null ⇒ one-off
}

/** A blank draft, optionally seeded (e.g. a prefilled `date` when adding to a day). */
export function emptyDraft(initial: Partial<ComposerDraft> = {}): ComposerDraft {
  return { title: '', notes: '', labelId: null, date: '', time: '', rule: null, ...initial }
}

/** Seed the editor from an existing task (the edit flow). */
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

/**
 * Normalize a draft into a `TaskInput`. Empty text collapses to null; a time or a
 * recurrence rule is dropped when there's no date (the backend rejects either
 * without one), so an unscheduled draft is always a clean Inbox capture.
 */
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
