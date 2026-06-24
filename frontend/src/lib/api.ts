// The ONE place the app talks HTTP. Every endpoint gets a typed function here;
// components import from this module and never call fetch directly.
import type { Health, Label } from './types'

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

export interface LabelInput {
  name: string
  color: string
}

export const api = {
  health: () => http<Health>('/health'),
  labels: {
    list: () => http<Label[]>('/labels'),
    create: (input: LabelInput) =>
      http<Label>('/labels', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: number, input: Partial<LabelInput>) =>
      http<Label>(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    remove: (id: number) => http<void>(`/labels/${id}`, { method: 'DELETE' }),
  },
}
