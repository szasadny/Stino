export interface Label {
  id: number
  name: string
  color: string
  emoji: string | null
  sort_order: number
}

export interface ImportSummary {
  created: { tasks: number; labels: number; completions: number }
  skipped: number
}

// Overdue one-offs moved + one copy per missed recurring series.
export interface RolloverSummary {
  moved: number
}

export type BatchOp =
  | { type: 'label'; label_id: number | null }
  | { type: 'schedule'; due_date: string }
  | { type: 'complete' }
  | { type: 'delete' }

export interface Task {
  id: number
  title: string
  notes: string | null
  label_id: number | null
  due_date: string | null // local date; null ⇒ Inbox; the series start for a recurring task
  due_time: string | null
  recurrence_rule: string | null
  // Key rows by `(id, occurrence_date)` — a recurring series repeats its id per occurrence.
  occurrence_date: string | null
  sort_order: number
  completed: boolean // for this occurrence only
}
