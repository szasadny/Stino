import * as chrono from 'chrono-node'
import { formatShortDate, fromISODate, toISODate } from './date'
import { firstOccurrenceOnOrAfter } from './first-occurrence'
import { parseRecurrencePhrase, summarizeRule } from './recurrence'

export interface QuickAddDraft {
  title: string
  label: string | null // bare `#tag` name
  due_date: string | null
  due_time: string | null // only when a time was explicitly stated
  recurrence_rule: string | null
}

const LABEL_TOKEN = /#([^\s#]+)/g

/** A task carries one label: every tag is stripped, only the first becomes the label. */
function extractLabel(text: string): { text: string; label: string | null } {
  let label: string | null = null
  const stripped = text.replace(LABEL_TOKEN, (_match, name: string) => {
    label ??= name
    return ' '
  })
  return { text: stripped.replace(/\s+/g, ' ').trim(), label }
}

/** The `#tag` being typed at `caret` (`start` = the `#` index), or null. */
export function activeLabelToken(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const match = /#([^\s#]*)$/.exec(text.slice(0, caret))
  return match ? { start: match.index, query: match[1] } : null
}

export function removeActiveToken(text: string, caret: number): { text: string; caret: number } {
  const token = activeLabelToken(text, caret)
  if (!token) return { text, caret }
  return { text: text.slice(0, token.start) + text.slice(caret), caret: token.start }
}

function toLocalTime(d: Date): string {
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

// chrono leaves "on"/"by" dangling before its match ("flight on june 30"), so strip it too.
function stripMatch(text: string, index: number, matched: string): string {
  const before = text.slice(0, index).replace(/\s+(on|at|by)\s*$/i, ' ')
  const after = text.slice(index + matched.length)
  return `${before}${after}`.replace(/\s+/g, ' ').trim()
}

/**
 * The recurrence phrase is stripped before chrono so a weekday inside it isn't read as a
 * one-off date. A dateless recurrence starts at `ref` (the backend rejects a rule without one).
 */
export function parseQuickAdd(input: string, ref: Date = new Date()): QuickAddDraft {
  const original = input.trim()
  const rec = parseRecurrencePhrase(original)
  const afterRec = rec
    ? stripMatch(original, original.indexOf(rec.matched), rec.matched) || original
    : original
  // Strip tags before chrono so a token like `#june` can't be misread as a date.
  const { text, label } = extractLabel(afterRec)

  // Re-read against the resolved start so a bare "every month" takes its day.
  const schedule = (start: string) => {
    const rule = (rec && parseRecurrencePhrase(rec.matched, start)?.rule) ?? null
    return {
      due_date: rule ? firstOccurrenceOnOrAfter(rule, start) : start,
      recurrence_rule: rule,
    }
  }

  const match = chrono.parse(text, ref, { forwardDate: true })[0]
  if (!match) {
    return {
      title: text,
      label,
      ...(rec ? schedule(toISODate(ref)) : { due_date: null, recurrence_rule: null }),
      due_time: null,
    }
  }

  const date = match.start.date()
  return {
    title: stripMatch(text, match.index, match.text) || text,
    label,
    ...schedule(toISODate(date)),
    due_time: match.start.isCertain('hour') ? toLocalTime(date) : null,
  }
}

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
