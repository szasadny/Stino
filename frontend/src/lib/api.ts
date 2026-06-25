// The ONE place the app talks HTTP. Every endpoint gets a typed function here;
// components import from this module and never call fetch directly.
import type { BatchOp, Health, ImportSummary, Label, Task } from './types'

const BASE = '/api'

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    throw new Error(await errorMessage(res, path, init))
  }
  // 204 No Content (e.g. DELETE) has no body to parse.
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

// Surface the backend's `{ "error": ... }` message when present so the UI can
// show validation feedback; otherwise fall back to a generic line.
async function errorMessage(res: Response, path: string, init?: RequestInit): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body.error === 'string') {
      return body.error
    }
  } catch {
    // Body wasn't JSON — fall through to the generic message.
  }
  return `${init?.method ?? 'GET'} ${path} failed: ${res.status}`
}

// For an update, `emoji` set to `null` clears it while an omitted key leaves it
// unchanged — the backend distinguishes the two (like the task fields below).
export interface LabelInput {
  name: string
  color: string
  emoji: string | null
}

// Task create/update payloads. For an update, a field set to `null` clears it
// (e.g. removing a label), while an omitted field is left unchanged — the
// backend distinguishes the two.
export interface TaskInput {
  title: string
  notes?: string | null
  label_id?: number | null
  due_date?: string | null
  due_time?: string | null
  recurrence_rule?: string | null
}

// Completing/reopening targets one occurrence. Omitting the date defaults to the
// task's own due_date (the only occurrence for a one-off; null for an Inbox task).
function occurrenceQuery(occurrenceDate?: string | null): string {
  return occurrenceDate ? `?occurrence_date=${occurrenceDate}` : ''
}

export const api = {
  health: () => http<Health>('/health'),
  // Find tasks by part of their title or notes (LIKE over both). A blank query
  // returns no rows. Recurring tasks come back as their series row, not expanded.
  search: (q: string) => http<Task[]>(`/search?q=${encodeURIComponent(q)}`),
  labels: {
    list: () => http<Label[]>('/labels'),
    create: (input: LabelInput) =>
      http<Label>('/labels', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<LabelInput>) =>
      http<Label>(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: number) => http<void>(`/labels/${id}`, { method: 'DELETE' }),
    // Persist a manual label order: `ids` is the full ordered list of label ids,
    // and each label's sort_order becomes its position. Drives the day view's
    // label-section order and the Labels manager.
    reorder: (ids: number[]) =>
      http<void>('/labels/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
  },
  tasks: {
    // Inbox = unscheduled tasks; `forDate` = everything on one local day;
    // `range` = every scheduled task in [from, to] for the calendar grid.
    inbox: () => http<Task[]>('/tasks?inbox=true'),
    forDate: (date: string) => http<Task[]>(`/tasks?date=${date}`),
    range: (from: string, to: string) => http<Task[]>(`/tasks?from=${from}&to=${to}`),
    create: (input: TaskInput) =>
      http<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<TaskInput>) =>
      http<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: number) => http<void>(`/tasks/${id}`, { method: 'DELETE' }),
    // Detach ONE occurrence of a recurring task onto another day: the series keeps
    // repeating elsewhere, and this instance becomes its own one-off task on `newDate`.
    // Returns the new detached task.
    moveOccurrence: (id: number, occurrenceDate: string, newDate: string) =>
      http<Task>(`/tasks/${id}/move_occurrence`, {
        method: 'POST',
        body: JSON.stringify({ occurrence_date: occurrenceDate, new_date: newDate }),
      }),
    // Persist a manual order for untimed tasks: `ids` is the full ordered list,
    // and each task's sort_order becomes its position. Timed/recurring tasks keep
    // their time-sort, so only untimed ids are sent.
    reorder: (ids: number[]) =>
      http<void>('/tasks/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
    // Apply one bulk operation (set label, schedule, complete, delete) to many
    // tasks at once — the Inbox multi-select. Atomic on the server: an unknown
    // id fails the whole batch.
    batch: (ids: number[], op: BatchOp) =>
      http<void>('/tasks/batch', { method: 'POST', body: JSON.stringify({ ids, op }) }),
    // Completing/reopening targets a single occurrence (see `occurrenceQuery`).
    // The response is that occurrence, so the caller updates exactly its row.
    complete: (id: number, occurrenceDate?: string | null) =>
      http<Task>(`/tasks/${id}/completions${occurrenceQuery(occurrenceDate)}`, { method: 'POST' }),
    uncomplete: (id: number, occurrenceDate?: string | null) =>
      http<Task>(`/tasks/${id}/completions${occurrenceQuery(occurrenceDate)}`, {
        method: 'DELETE',
      }),
  },
  import: {
    // Upload a TickTick CSV backup. The picked File is sent as the raw request
    // body; the empty `headers` lets the browser set the file's content type
    // (overriding the default JSON one), and the backend parses the bytes as CSV.
    ticktick: (file: File) =>
      http<ImportSummary>('/import/ticktick', { method: 'POST', body: file, headers: {} }),
  },
}
