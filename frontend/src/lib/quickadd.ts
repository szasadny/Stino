import * as chrono from 'chrono-node'
import { formatShortDate, toISODate, toLocalTime } from './date'
import { findLabelByName } from './labels'
import { summarizeRule } from './recurrence/describe'
import { firstOccurrenceOnOrAfter } from './recurrence/first-occurrence'
import { parseRecurrencePhrase } from './recurrence/phrase-parse'
import type { Label, TaskInput } from './types'

export type LabelSuggestion = { type: 'label'; label: Label } | { type: 'create'; name: string }

export type ListboxStep =
  { type: 'move'; active: number } | { type: 'choose'; active: number } | { type: 'dismiss' }

type QuickAddDraft = Required<
  Pick<TaskInput, 'title' | 'due_date' | 'due_time' | 'recurrence_rule'>
> & {
  label: string | null
}

const LABEL_TOKEN = /#([^\s#]+)/g

// A task carries one label: every tag is stripped, only the first becomes the label.
function extractLabel(text: string): { text: string; label: string | null } {
  let label: string | null = null
  const stripped = text.replace(LABEL_TOKEN, (_match, name: string) => {
    label ??= name
    return ' '
  })
  return { text: stripped.replace(/\s+/g, ' ').trim(), label }
}

export function activeLabelToken(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const match = /#([^\s#]*)$/.exec(text.slice(0, caret))
  return match ? { start: match.index, query: match[1] ?? '' } : null
}

export function removeActiveToken(text: string, caret: number): { text: string; caret: number } {
  const token = activeLabelToken(text, caret)
  if (!token) return { text, caret }
  return { text: text.slice(0, token.start) + text.slice(caret), caret: token.start }
}

export function labelSuggestions(labels: Label[], query: string): LabelSuggestion[] {
  const name = query.trim()
  const wanted = name.toLowerCase()
  const rows: LabelSuggestion[] = labels
    .filter((l) => l.name.toLowerCase().includes(wanted))
    .map((label) => ({ type: 'label', label }))
  if (name && !findLabelByName(labels, name)) rows.push({ type: 'create', name })
  return rows
}

export function listboxStep(key: string, active: number, count: number): ListboxStep | null {
  if (count === 0) return null
  switch (key) {
    case 'ArrowDown':
      return { type: 'move', active: (active + 1) % count }
    case 'ArrowUp':
      return { type: 'move', active: (active - 1 + count) % count }
    case 'Enter':
      return { type: 'choose', active }
    case 'Escape':
      return { type: 'dismiss' }
    default:
      return null
  }
}

// chrono leaves "on"/"by" dangling before its match ("flight on june 30"), so strip it too.
function stripMatch(text: string, index: number, matched: string): string {
  const before = text.slice(0, index).replace(/\s+(on|at|by)\s*$/i, ' ')
  const after = text.slice(index + matched.length)
  return `${before}${after}`.replace(/\s+/g, ' ').trim()
}

// Tags go before the phrase (`#weekly` is a label), the phrase before chrono (its weekday isn't a date).
export function parseQuickAdd(input: string, ref = new Date()): QuickAddDraft {
  const { text, label } = extractLabel(input)
  const rec = parseRecurrencePhrase(text)
  const rest = rec ? stripMatch(text, text.indexOf(rec.matched), rec.matched) : text
  // chrono converts a named zone ("9am PST") to local wall-clock time, which can shift the date.
  const match = rest ? chrono.parse(rest, ref, { forwardDate: true })[0] : undefined
  const title = (match ? stripMatch(rest, match.index, match.text) : rest) || text
  if (!match && !rec) {
    return { title, label, due_date: null, due_time: null, recurrence_rule: null }
  }

  // A dateless recurrence starts at `ref`; a bare "every month" takes its day from the start.
  const start = toISODate(match ? match.start.date() : ref)
  const rule = rec ? (parseRecurrencePhrase(rec.matched, start)?.rule ?? null) : null
  return {
    title,
    label,
    due_date: rule ? firstOccurrenceOnOrAfter(rule, start) : start,
    due_time: match?.start.isCertain('hour') ? toLocalTime(match.start.date()) : null,
    recurrence_rule: rule,
  }
}

export function quickAddInput(draft: QuickAddDraft, labelId: number | null): TaskInput {
  const { title, due_date, due_time, recurrence_rule } = draft
  return { title, label_id: labelId, due_date, due_time, recurrence_rule }
}

export function describeDraft(draft: QuickAddDraft): string | null {
  if (!draft.due_date && !draft.recurrence_rule) return null
  const parts: string[] = []
  if (draft.due_date) {
    const date = formatShortDate(draft.due_date)
    parts.push(draft.due_time ? `${date}, ${draft.due_time}` : date)
  }
  if (draft.recurrence_rule) parts.push(summarizeRule(draft.recurrence_rule))
  return parts.join(' · ')
}
