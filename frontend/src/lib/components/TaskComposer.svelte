<script lang="ts">
  // The one task editor — used to add a task in full (the alternative to a quick
  // capture) and to edit an existing one, everywhere a task is created or changed
  // (Inbox, Today, the day sheet, a tapped calendar task). It's a presentational
  // form: it owns a local draft and emits a normalized `TaskInput` via `onSubmit`;
  // the caller does the API call and list update, so this stays reusable and the
  // boundary (HTTP only in views/api) holds. Validation/normalization lives in
  // lib/composer.ts. Label assignment is chip-based here (tap to toggle), a calmer,
  // more legible alternative to the dropdown used in the bulk bar.
  import { untrack } from 'svelte'
  import type { Label } from '../types'
  import type { TaskInput } from '../api'
  import { type ComposerDraft, draftToInput, emptyDraft } from '../composer'
  import { INPUT_CLASS, TITLE_MAX_LENGTH } from '../constants'
  import { toISODate } from '../date'
  import DeleteConfirm from './DeleteConfirm.svelte'
  import RecurrencePicker from './RecurrencePicker.svelte'

  let {
    labels,
    initial = {},
    submitLabel = 'Save',
    busy = false,
    onSubmit,
    onCancel,
    onDelete,
  }: {
    labels: Label[]
    initial?: Partial<ComposerDraft>
    submitLabel?: string
    busy?: boolean
    onSubmit: (input: TaskInput) => void
    onCancel: () => void
    // Present only when editing an existing task — shows a Delete button. The caller
    // does the API call + list update (HTTP stays in views/api), this just asks.
    onDelete?: () => void
  } = $props()

  // Seeded once; the form is remounted per editing session by its container, so it
  // never needs to react to `initial` changing under it (untrack makes that explicit).
  const draft = $state<ComposerDraft>(untrack(() => emptyDraft(initial)))

  const canSubmit = $derived(draft.title.trim().length > 0 && !busy)
  const editingSeries = $derived(initial.rule != null)

  // Quick-date shortcuts so a date is one tap away without opening the picker.
  const todayISO = toISODate(new Date())
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowISO = toISODate(tomorrow)

  function setLabel(id: number | null) {
    draft.labelId = draft.labelId === id ? null : id
  }

  function setDate(value: string) {
    draft.date = value
    syncTime()
  }

  // A time can't outlive its date — clear it so the field never shows a value that
  // would be silently dropped on submit (the picker shows its own "needs a date").
  function syncTime() {
    if (!draft.date) draft.time = ''
  }

  function focus(node: HTMLElement) {
    node.focus()
  }

  function submit(event: SubmitEvent) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit(draftToInput(draft))
  }
</script>

<form onsubmit={submit} class="space-y-4">
  <div class="space-y-3">
    <input
      bind:value={draft.title}
      use:focus
      type="text"
      placeholder="Task name"
      maxlength={TITLE_MAX_LENGTH}
      autocomplete="off"
      aria-label="Task name"
      class="w-full rounded-lg border border-lichen bg-fog px-3 py-2.5 text-base font-medium text-ink outline-none transition placeholder:font-normal placeholder:text-sage focus:border-pine focus:bg-surface"
    />
    <textarea
      bind:value={draft.notes}
      rows="2"
      placeholder="Notes"
      aria-label="Notes"
      class="w-full resize-none {INPUT_CLASS}"
    ></textarea>
  </div>

  {#if labels.length > 0}
    <div class="space-y-1.5">
      <span class="block text-xs font-medium text-sage">Label</span>
      <div class="flex flex-wrap gap-1.5">
        <button
          type="button"
          onclick={() => setLabel(null)}
          aria-pressed={draft.labelId === null}
          class="rounded-full border px-2.5 py-1 text-xs font-medium transition {draft.labelId ===
          null
            ? 'border-pine bg-pine/10 text-pine'
            : 'border-lichen text-sage hover:border-pine/40 hover:text-pine-deep'}"
        >
          None
        </button>
        {#each labels as label (label.id)}
          <button
            type="button"
            onclick={() => setLabel(label.id)}
            aria-pressed={draft.labelId === label.id}
            class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition {draft.labelId ===
            label.id
              ? 'border-pine bg-pine/10 text-pine'
              : 'border-lichen text-sage hover:border-pine/40 hover:text-pine-deep'}"
          >
            <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background-color: {label.color}"
            ></span>
            {#if label.emoji}
              <span class="leading-none" aria-hidden="true">{label.emoji}</span>
            {/if}
            {label.name}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="space-y-1.5">
    <span class="block text-xs font-medium text-sage">Schedule</span>
    <div class="flex flex-wrap items-center gap-1.5">
      <input
        bind:value={draft.date}
        onchange={syncTime}
        type="date"
        aria-label="Due date"
        class="rounded-lg border border-lichen bg-fog px-2.5 py-1.5 text-sm text-ink outline-none transition hover:border-sage focus:border-pine focus:bg-surface"
      />
      <input
        bind:value={draft.time}
        type="time"
        disabled={!draft.date}
        aria-label="Due time"
        title={draft.date ? '' : 'Pick a date first'}
        class="rounded-lg border border-lichen bg-fog px-2.5 py-1.5 text-sm text-ink outline-none transition hover:border-sage focus:border-pine focus:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
      />
      <button
        type="button"
        onclick={() => setDate(todayISO)}
        class="rounded-lg border border-lichen px-2.5 py-1.5 text-xs font-medium text-sage transition hover:border-pine/40 hover:text-pine-deep"
      >
        Today
      </button>
      <button
        type="button"
        onclick={() => setDate(tomorrowISO)}
        class="rounded-lg border border-lichen px-2.5 py-1.5 text-xs font-medium text-sage transition hover:border-pine/40 hover:text-pine-deep"
      >
        Tomorrow
      </button>
      {#if draft.date}
        <button
          type="button"
          onclick={() => setDate('')}
          class="rounded-lg px-2 py-1.5 text-xs font-medium text-sage transition hover:bg-bark/10 hover:text-bark"
        >
          Clear
        </button>
      {/if}
    </div>
    {#if !draft.date}
      <p class="text-xs text-sage">No date — stays in the Inbox.</p>
    {/if}
  </div>

  <RecurrencePicker
    value={draft.rule}
    startDate={draft.date || null}
    onChange={(rule) => (draft.rule = rule)}
  />

  <div class="space-y-2 border-t border-lichen pt-3">
    {#if editingSeries}
      <p class="text-xs text-sage">Changes apply to the whole series.</p>
    {/if}
    <div class="flex items-center justify-between gap-3">
      {#if onDelete}
        <DeleteConfirm onConfirm={onDelete} {busy} />
      {:else}
        <span></span>
      {/if}
      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onclick={onCancel}
          class="rounded-lg px-3 py-1.5 text-sm font-medium text-sage transition hover:text-pine-deep"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          class="rounded-lg bg-pine px-4 py-1.5 text-sm font-medium text-surface transition hover:bg-pine-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  </div>
</form>
