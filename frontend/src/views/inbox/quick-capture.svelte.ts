import { tick } from 'svelte'
import { api } from '../../lib/api'
import type { ComposerDraft } from '../../lib/composer'
import type { TaskCore } from '../../lib/controllers/task-core.svelte'
import { findLabelByName } from '../../lib/labels'
import { ADD_TASK_FAILED } from '../../lib/messages'
import {
  activeLabelToken,
  describeDraft,
  quickAddInput,
  labelSuggestions,
  listboxStep,
  parseQuickAdd,
  removeActiveToken,
  type LabelSuggestion,
} from '../../lib/quickadd'
import type { Label, Task } from '../../lib/types'

export type QuickCapture = ReturnType<typeof createQuickCapture>

export type CaptureLabel = { label: Label; chosen: boolean } | { pending: string }

export function createQuickCapture(core: TaskCore) {
  let text = $state('')
  let caret = $state(0)
  let chosenId = $state<number | null>(null)
  let dismissed = $state(false)
  let highlight = $state(0)
  let input = $state<HTMLInputElement | null>(null)

  const draft = $derived(parseQuickAdd(text))
  const preview = $derived(describeDraft(draft))
  const activeTag = $derived(activeLabelToken(text, caret))
  const suggestions = $derived(
    activeTag && !dismissed ? labelSuggestions(core.labels, activeTag.query) : [],
  )

  const label = $derived.by((): CaptureLabel | null => {
    if (chosenId != null) {
      const chip = core.labels.find((l) => l.id === chosenId)
      return chip ? { label: chip, chosen: true } : null
    }
    if (!draft.label) return null
    const found = findLabelByName(core.labels, draft.label)
    return found ? { label: found, chosen: false } : { pending: draft.label }
  })

  function syncCaret() {
    caret = input?.selectionStart ?? text.length
  }

  async function choose(row: LabelSuggestion): Promise<void> {
    const picked = row.type === 'label' ? row.label : await core.ensureLabel(row.name)
    if (!picked) return
    chosenId = picked.id
    const next = removeActiveToken(text, caret)
    text = next.text
    caret = next.caret
    dismissed = false
    highlight = 0
    await tick()
    input?.focus()
    input?.setSelectionRange(next.caret, next.caret)
  }

  // `undefined` means a typed #tag could not be created.
  async function resolveLabelId(): Promise<number | null | undefined> {
    if (chosenId != null) return chosenId
    if (!draft.label) return null
    const created = await core.ensureLabel(draft.label)
    return created ? created.id : undefined
  }

  function captured(task: Task): void {
    if (!task.due_date) core.insert(task)
    text = ''
    chosenId = null
  }

  return {
    get text() {
      return text
    },
    set text(value: string) {
      text = value
    },
    get input() {
      return input
    },
    set input(el: HTMLInputElement | null) {
      input = el
    },
    get preview() {
      return preview
    },
    get label() {
      return label
    },
    get suggestions() {
      return suggestions
    },
    get menuOpen() {
      return suggestions.length > 0
    },
    get highlight() {
      return highlight
    },
    syncCaret,
    choose,
    captured,

    onInput(): void {
      syncCaret()
      dismissed = false
      highlight = 0
      if (activeTag) chosenId = null
    },

    keydown(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>): void {
      const step = listboxStep(event.key, highlight, suggestions.length)
      if (!step) return
      event.preventDefault()
      if (step.type === 'move') highlight = step.active
      else if (step.type === 'dismiss') dismissed = true
      else {
        const row = suggestions[step.active]
        if (row) void choose(row)
      }
    },

    hover(index: number): void {
      highlight = index
    },

    dismiss(): void {
      dismissed = true
    },

    clearLabel(): void {
      chosenId = null
    },

    async submit(): Promise<void> {
      if (!draft.title) return
      const labelId = await resolveLabelId()
      if (labelId === undefined) return
      await core.run(async () => {
        captured(await api.tasks.create(quickAddInput(draft, labelId)))
      }, ADD_TASK_FAILED)
    },

    // The dialog's picker only knows saved labels, so a pending #tag is created first.
    async details(): Promise<Partial<ComposerDraft> | null> {
      const labelId = await resolveLabelId()
      if (labelId === undefined) return null
      return {
        title: draft.title,
        labelId,
        date: draft.due_date ?? '',
        time: draft.due_time ?? '',
        rule: draft.recurrence_rule,
      }
    },
  }
}
