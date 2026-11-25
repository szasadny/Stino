import { API_BASE, HTTP_SERVER_ERROR } from './constants'
import { apiErrorMessage } from './errors'
import { NETWORK_ERROR_MESSAGE } from './messages'
import type {
  BatchOp,
  ImportSummary,
  Label,
  LabelInput,
  RolloverSummary,
  Task,
  TaskInput,
} from './types'

async function request(path: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    // fetch only rejects when no response arrived (offline, aborted, server down).
    throw new Error(NETWORK_ERROR_MESSAGE)
  }
  if (!res.ok) {
    // A 5xx message is server detail, not something the user can act on.
    const body: unknown = res.status < HTTP_SERVER_ERROR ? await res.json().catch(() => null) : null
    throw new Error(apiErrorMessage(body))
  }
  return res
}

// The JSON body is trusted to match the API contract; there is no runtime schema.
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await request(path, init)
  return res.json()
}

async function send(path: string, init?: RequestInit): Promise<void> {
  await request(path, init)
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
    remove: (id: number) => send(`/labels/${id}`, { method: 'DELETE' }),
    // Must list every label.
    reorder: (ids: number[]) =>
      send('/labels/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
  },
  tasks: {
    inbox: () => http<Task[]>('/tasks?inbox=true'),
    forDate: (date: string) => http<Task[]>(`/tasks?date=${date}`),
    range: (from: string, to: string) => http<Task[]>(`/tasks?from=${from}&to=${to}`),
    create: (input: TaskInput) =>
      http<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<TaskInput>) =>
      http<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: number) => send(`/tasks/${id}`, { method: 'DELETE' }),
    moveOccurrence: (id: number, occurrenceDate: string, newDate: string) =>
      http<Task>(`/tasks/${id}/move_occurrence`, {
        method: 'POST',
        body: JSON.stringify({ occurrence_date: occurrenceDate, new_date: newDate }),
      }),
    skipOccurrence: (id: number, occurrenceDate: string) =>
      send(`/tasks/${id}/skip_occurrence`, {
        method: 'POST',
        body: JSON.stringify({ occurrence_date: occurrenceDate }),
      }),
    reorder: (ids: number[]) =>
      send('/tasks/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
    // The browser supplies `today`; the backend never computes it.
    rollover: (today: string) =>
      http<RolloverSummary>('/tasks/rollover', {
        method: 'POST',
        body: JSON.stringify({ today }),
      }),
    batch: (ids: number[], op: BatchOp) =>
      send('/tasks/batch', { method: 'POST', body: JSON.stringify({ ids, op }) }),
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
