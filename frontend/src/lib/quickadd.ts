// Quick-add: turn one line of natural-language capture ("call mum tomorrow 9am")
// into a task draft. Date/time parsing is CLIENT-SIDE with chrono-node (per
// CLAUDE.md "External Solutions First" — never parse free text on the server).
// Dates/times are formatted as LOCAL `YYYY-MM-DD` / `HH:MM` (Hard Rule 7):
// chrono yields a local Date and we read its local components, never via UTC.
// Pure (given `ref`) so it stays unit-testable.
import * as chrono from 'chrono-node'
import { formatShortDate, fromISODate, toISODate } from './date'

export interface QuickAddDraft {
  title: string
  due_date: string | null // 'YYYY-MM-DD' local, or null ⇒ no date found (stays in the Inbox)
  due_time: string | null // 'HH:MM' local, only when a time was explicitly stated
}

/** Local `HH:MM` for a Date — reads local components, never via UTC. */
function toLocalTime(d: Date): string {
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Remove the matched date phrase from the line and tidy the leftover. chrono
 * usually absorbs the leading connector ("at"/"next"/"this") into its match but
 * leaves "on"/"by" dangling ("flight on june 30" → matches "june 30"), so strip
 * a trailing connector off the part before the match too.
 */
function stripMatch(text: string, index: number, matched: string): string {
  const before = text.slice(0, index).replace(/\s+(on|at|by)\s*$/i, ' ')
  const after = text.slice(index + matched.length)
  return `${before}${after}`.replace(/\s+/g, ' ').trim()
}

/**
 * Split a capture line into a title and an optional local date/time. Takes
 * chrono's first match, removes its phrase from the title, and formats the
 * result locally. No date phrase ⇒ just the trimmed title (a plain Inbox
 * capture). A time is set only when chrono is certain about the hour, so
 * "friday" stays all-day while "friday 9am" gets a time. `forwardDate` biases
 * bare weekdays to the upcoming one — the right default for capturing tasks. If
 * stripping the date leaves nothing (the whole line was a date), the original
 * text is kept as the title rather than producing an empty task.
 */
export function parseQuickAdd(input: string, ref: Date = new Date()): QuickAddDraft {
  const text = input.trim()
  const match = chrono.parse(text, ref, { forwardDate: true })[0]
  if (!match) {
    return { title: text, due_date: null, due_time: null }
  }

  const date = match.start.date()
  return {
    title: stripMatch(text, match.index, match.text) || text,
    due_date: toISODate(date),
    due_time: match.start.isCertain('hour') ? toLocalTime(date) : null,
  }
}

/**
 * A compact preview of a draft's schedule for the capture hint, e.g.
 * "Fri 26 June, 09:00" — or null when the draft has no date (a plain Inbox
 * capture), so the caller can hide the hint.
 */
export function describeDraft(draft: QuickAddDraft): string | null {
  if (!draft.due_date) {
    return null
  }
  const label = formatShortDate(fromISODate(draft.due_date))
  return draft.due_time ? `${label}, ${draft.due_time}` : label
}
