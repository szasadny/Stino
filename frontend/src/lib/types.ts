// Shared types mirroring the API contract — single source of truth on the client.

export interface Health {
  status: string
  db: boolean
}

export interface Label {
  id: number
  name: string
  color: string
  emoji: string | null // optional glyph shown beside the color dot; null => color-only
  sort_order: number
}

// Result of a TickTick CSV import (mirrors the backend `ImportSummary`). The
// import is add-only, so a re-run appends; `skipped` counts rows that couldn't
// be mapped (e.g. a row with no title).
export interface ImportSummary {
  created: { tasks: number; labels: number; completions: number }
  skipped: number
}

// A bulk operation applied to many tasks at once (Inbox multi-select), sent to
// POST /tasks/batch. Mirrors the backend `BatchOpBody` tagged enum: `type` is
// the discriminator. `label_id: null` clears the label; `schedule` moves the
// tasks out of the Inbox onto `due_date`.
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
  due_date: string | null // 'YYYY-MM-DD' local date; null => Inbox. For a recurring task this is the series start (DTSTART)
  due_time: string | null // 'HH:MM' local time; null => untimed
  recurrence_rule: string | null // RRULE; null => one-off
  // The specific instance this row represents. For a recurring task the
  // calendar/day queries return one Task per occurrence with `occurrence_date`
  // set to the instance date; for a one-off it equals `due_date`. Key rows by
  // `(id, occurrence_date)` — the same id repeats across a recurring series.
  occurrence_date: string | null
  sort_order: number
  completed: boolean // a completion exists for this occurrence
}
