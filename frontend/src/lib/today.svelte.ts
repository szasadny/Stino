// App-wide local "today" (a `YYYY-MM-DD` key), so open views follow a midnight rollover.
// App's day-change check is the only writer.
import { fromISODate, toISODate } from './date'

let key = $state(toISODate(new Date()))

export function todayKey(): string {
  return key
}

export function todayDate(): Date {
  return fromISODate(key)
}

/** Advance to `next`; returns whether the day changed. */
export function setToday(next: string): boolean {
  if (next === key) return false
  key = next
  return true
}
