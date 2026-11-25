// Reactive so open views follow a midnight rollover; App's day-change check is the only writer.
import { currentDateKey, fromISODate } from './date'

let key = $state(currentDateKey())

export function todayKey(): string {
  return key
}

export function todayDate(): Date {
  return fromISODate(key)
}

export function setToday(next: string): boolean {
  if (next === key) return false
  key = next
  return true
}
