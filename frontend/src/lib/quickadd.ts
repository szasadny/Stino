// Quick-add parsing is client-side (chrono-node) and preserves local date/time fields.
import * as chrono from 'chrono-node'
import { formatShortDate, fromISODate, toISODate } from './date'
import { parseRecurrencePhrase, summarizeRule } from './recurrence'

export interface QuickAddDraft {
  title: string
  label: string | null // bare name from a `#tag` token, e.g. "groceries"; null ⇒ no tag typed
  due_date: string | null // 'YYYY-MM-DD' local, or null ⇒ no date found (stays in the Inbox)
  due_time: string | null // 'HH:MM' local, only when a time was explicitly stated
  recurrence_rule: string | null // RRULE parsed from a phrase like "every Monday"; null ⇒ one-off
}

// TickTick-style single-token inline label.
const LABEL_TOKEN = /#([^\s#]+)/g

/**
 * Pull every `#tag` out of `text`, returning the de-tagged remainder and the
 * first tag name. A Stinō task carries one label, so any extra tags are still
 * stripped from the title but only the first becomes the label.
 */
function extractLabel(text: string): { text: string; label: string | null } {
  let label: string | null = null
  const stripped = text.replace(LABEL_TOKEN, (_match, name: string) => {
    label ??= name
    return ' '
  })
  return { text: stripped.replace(/\s+/g, ' ').trim(), label }
}

/**
 * The in-progress `#tag` ending at `caret` — nothing but tag chars between the
 * `#` and the caret — or null when the caret isn't inside a tag. `start` is the
 * `#` index; `query` is the partial typed so far (may be ''). Drives the inline
 * label-suggestion menu; pure so it stays unit-testable.
 */
export function activeLabelToken(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const match = /#([^\s#]*)$/.exec(text.slice(0, caret))
  return match ? { start: match.index, query: match[1] } : null
}

/**
 * Remove the active `#tag` token at `caret` from `text` — used when a label is
 * picked from the menu and tracked as a chip rather than left inline. Returns the
 * new text and where the caret should land (no-op when not inside a tag).
 */
export function removeActiveToken(text: string, caret: number): { text: string; caret: number } {
  const token = activeLabelToken(text, caret)
  if (!token) return { text, caret }
  return { text: text.slice(0, token.start) + text.slice(caret), caret: token.start }
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
 * Split a capture line into a title and an optional local date/time + recurrence.
 * A recurrence phrase ("every Monday", "the 15th of every month") is pulled out
 * first and stripped, so chrono doesn't read a bogus one-off date from a weekday
 * inside it; chrono then takes the start date/time off the remainder. No date
 * phrase ⇒ just the trimmed title (a plain Inbox capture); a recurrence with no
 * explicit date defaults its DTSTART to `ref`, because the backend rejects a
 * rule without a date. A time is set only when chrono is certain about the hour,
 * so "friday" stays all-day while "friday 9am" gets a time. `forwardDate` biases
 * bare weekdays to the upcoming one. If stripping leaves nothing (the whole line
 * was schedule text), the original text is kept as the title.
 */
export function parseQuickAdd(input: string, ref: Date = new Date()): QuickAddDraft {
  const original = input.trim()
  const rec = parseRecurrencePhrase(original)
  const afterRec = rec
    ? stripMatch(original, original.indexOf(rec.matched), rec.matched) || original
    : original
  // Strip tags before chrono so a token like `#june` can't be misread as a date.
  const { text, label } = extractLabel(afterRec)

  const match = chrono.parse(text, ref, { forwardDate: true })[0]
  if (!match) {
    return {
      title: text,
      label,
      due_date: rec ? toISODate(ref) : null,
      due_time: null,
      recurrence_rule: rec?.rule ?? null,
    }
  }

  const date = match.start.date()
  return {
    title: stripMatch(text, match.index, match.text) || text,
    label,
    due_date: toISODate(date),
    due_time: match.start.isCertain('hour') ? toLocalTime(date) : null,
    recurrence_rule: rec?.rule ?? null,
  }
}

/**
 * A compact preview of a draft's schedule for the capture hint, e.g.
 * "Fri 26 June, 09:00 · Monthly on day 15" — or null when the draft has no date
 * and no recurrence (a plain Inbox capture), so the caller can hide the hint.
 */
export function describeDraft(draft: QuickAddDraft): string | null {
  if (!draft.due_date && !draft.recurrence_rule) {
    return null
  }
  const parts: string[] = []
  if (draft.due_date) {
    const label = formatShortDate(fromISODate(draft.due_date))
    parts.push(draft.due_time ? `${label}, ${draft.due_time}` : label)
  }
  if (draft.recurrence_rule) {
    parts.push(summarizeRule(draft.recurrence_rule))
  }
  return parts.join(' · ')
}
