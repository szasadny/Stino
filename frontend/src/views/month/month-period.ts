import { addMonths, buildMonthGrid, firstOfMonth, spanBounds } from '../../lib/date'

export function monthStart(date: Date): Date {
  return firstOfMonth(date.getFullYear(), date.getMonth())
}

export function stepMonth(start: Date, delta: number): Date {
  const next = addMonths(start.getFullYear(), start.getMonth(), delta)
  return firstOfMonth(next.year, next.month)
}

// An open day zoom stays open across navigation, so its day stays fetched and on the board.
export function monthRange(start: Date, selectedKey: string | null): [string, string] {
  const [from, to] = spanBounds(buildMonthGrid(start.getFullYear(), start.getMonth()))
  if (selectedKey == null) return [from, to]
  return [selectedKey < from ? selectedKey : from, selectedKey > to ? selectedKey : to]
}

export function withDay(keys: string[], key: string | null): string[] {
  return key != null && !keys.includes(key) ? [...keys, key] : keys
}
