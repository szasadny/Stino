// Typed HTTP boundary; components never call fetch directly.
import type { BatchOp, ImportSummary, Label, RolloverSummary, Task } from './types'

const BASE = '/api'

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    throw new Error(await errorMessage(res, path, init))
  }
  // DELETE responses have no JSON body.
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

// Prefer the backend's validation message, with a generic fallback.
async function errorMessage(res: Response, path: string, init?: RequestInit): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown }
    if (typeof body.error === 'string') {
      return body.error
    }
  } catch {
    // Non-JSON error bodies use the generic message below.
  }
  return `${init?.method ?? 'GET'} ${path} failed: ${res.status}`
}

// `null` clears emoji; omission leaves it unchanged.
export interface LabelInput {
  name: string
  color: string
  emoji: string | null
}

// For updates, `null` clears a field and omission leaves it unchanged.
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
  // Search title/notes; recurring tasks are returned as series rows.
  search: (q: string) => http<Task[]>(`/search?q=${encodeURIComponent(q)}`),
  labels: {
    list: () => http<Label[]>('/labels'),
    create: (input: LabelInput) =>
      http<Label>('/labels', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<LabelInput>) =>
      http<Label>(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: number) => http<void>(`/labels/${id}`, { method: 'DELETE' }),
    // Persist the complete manual label order.
    reorder: (ids: number[]) =>
      http<void>('/labels/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
  },
  tasks: {
    // Inbox, one local day, or a calendar date range.
    inbox: () => http<Task[]>('/tasks?inbox=true'),
    forDate: (date: string) => http<Task[]>(`/tasks?date=${date}`),
    range: (from: string, to: string) => http<Task[]>(`/tasks?from=${from}&to=${to}`),
    create: (input: TaskInput) =>
      http<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<TaskInput>) =>
      http<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: number) => http<void>(`/tasks/${id}`, { method: 'DELETE' }),
    // Detach one recurring occurrence; the series keeps repeating.
    moveOccurrence: (id: number, occurrenceDate: string, newDate: string) =>
      http<Task>(`/tasks/${id}/move_occurrence`, {
        method: 'POST',
        body: JSON.stringify({ occurrence_date: occurrenceDate, new_date: newDate }),
      }),
    // Persist the complete order of untimed tasks; timed tasks stay time-sorted.
    reorder: (ids: number[]) =>
      http<void>('/tasks/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
    // Move overdue non-recurring tasks onto the browser-supplied local date.
    rollover: (today: string) =>
      http<RolloverSummary>('/tasks/rollover', {
        method: 'POST',
        body: JSON.stringify({ today }),
      }),
    // Apply one atomic operation to Inbox-selected tasks.
    batch: (ids: number[], op: BatchOp) =>
      http<void>('/tasks/batch', { method: 'POST', body: JSON.stringify({ ids, op }) }),
    // Complete/reopen one occurrence and return that row.
    complete: (id: number, occurrenceDate?: string | null) =>
      http<Task>(`/tasks/${id}/completions${occurrenceQuery(occurrenceDate)}`, { method: 'POST' }),
    uncomplete: (id: number, occurrenceDate?: string | null) =>
      http<Task>(`/tasks/${id}/completions${occurrenceQuery(occurrenceDate)}`, {
        method: 'DELETE',
      }),
  },
  import: {
    // Send the raw TickTick CSV so the browser supplies its content type.
    ticktick: (file: File) =>
      http<ImportSummary>('/import/ticktick', { method: 'POST', body: file, headers: {} }),
  },
}
