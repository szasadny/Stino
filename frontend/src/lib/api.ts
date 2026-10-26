import { NETWORK_ERROR_MESSAGE } from './constants'
import { apiErrorMessage } from './errors'
import type { BatchOp, ImportSummary, Label, RolloverSummary, Task } from './types'

const BASE = '/api'

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    // fetch only rejects when no response arrived (offline, aborted, server down).
    throw new Error(NETWORK_ERROR_MESSAGE)
  }
  if (!res.ok) {
    // A 5xx message is server detail, not something the user can act on.
    const body: unknown = res.status < 500 ? await res.json().catch(() => null) : null
    throw new Error(apiErrorMessage(body))
  }
  // DELETE responses have no JSON body.
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

// `null` clears emoji; omission leaves it unchanged.
export interface LabelInput {
  name: string
  color: string
  emoji: string | null
}

// On update, `null` clears a field and omission leaves it unchanged.
export interface TaskInput {
  title: string
  notes?: string | null
  label_id?: number | null
  due_date?: string | null
  due_time?: string | null
  recurrence_rule?: string | null
}

// Omitting the date defaults to the task's own due_date.
function occurrenceQuery(occurrenceDate?: string | null): string {
  return occurrenceDate ? `?occurrence_date=${occurrenceDate}` : ''
}

export const api = {
  // Recurring tasks come back as series rows, not occurrences.
  search: (q: string) => http<Task[]>(`/search?q=${encodeURIComponent(q)}`),
  labels: {
    list: () => http<Label[]>('/labels'),
    create: (input: LabelInput) =>
      http<Label>('/labels', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<LabelInput>) =>
      http<Label>(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: number) => http<void>(`/labels/${id}`, { method: 'DELETE' }),
    // Must list every label.
    reorder: (ids: number[]) =>
      http<void>('/labels/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
  },
  tasks: {
    inbox: () => http<Task[]>('/tasks?inbox=true'),
    forDate: (date: string) => http<Task[]>(`/tasks?date=${date}`),
    range: (from: string, to: string) => http<Task[]>(`/tasks?from=${from}&to=${to}`),
    create: (input: TaskInput) =>
      http<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<TaskInput>) =>
      http<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: number) => http<void>(`/tasks/${id}`, { method: 'DELETE' }),
    moveOccurrence: (id: number, occurrenceDate: string, newDate: string) =>
      http<Task>(`/tasks/${id}/move_occurrence`, {
        method: 'POST',
        body: JSON.stringify({ occurrence_date: occurrenceDate, new_date: newDate }),
      }),
    skipOccurrence: (id: number, occurrenceDate: string) =>
      http<void>(`/tasks/${id}/skip_occurrence`, {
        method: 'POST',
        body: JSON.stringify({ occurrence_date: occurrenceDate }),
      }),
    reorder: (ids: number[]) =>
      http<void>('/tasks/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
    // The browser supplies `today`; the backend never computes it.
    rollover: (today: string) =>
      http<RolloverSummary>('/tasks/rollover', {
        method: 'POST',
        body: JSON.stringify({ today }),
      }),
    batch: (ids: number[], op: BatchOp) =>
      http<void>('/tasks/batch', { method: 'POST', body: JSON.stringify({ ids, op }) }),
    complete: (id: number, occurrenceDate?: string | null) =>
      http<Task>(`/tasks/${id}/completions${occurrenceQuery(occurrenceDate)}`, { method: 'POST' }),
    uncomplete: (id: number, occurrenceDate?: string | null) =>
      http<Task>(`/tasks/${id}/completions${occurrenceQuery(occurrenceDate)}`, {
        method: 'DELETE',
      }),
  },
  import: {
    // `headers: {}` drops the JSON content type so the browser sets the file's.
    ticktick: (file: File) =>
      http<ImportSummary>('/import/ticktick', { method: 'POST', body: file, headers: {} }),
  },
}
