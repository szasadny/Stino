// Shared types mirroring the API contract — single source of truth on the client.

export interface Health {
  status: string
  db: boolean
}

export interface Label {
  id: number
  name: string
  color: string
  sort_order: number
}

export interface Task {
  id: number
  title: string
  notes: string | null
  label_id: number | null
  due_date: string | null // 'YYYY-MM-DD' local date; null => Inbox
  due_time: string | null // 'HH:MM' local time; null => untimed
  recurrence_rule: string | null
  sort_order: number
}
