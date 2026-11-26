<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { dateForRule, draftToInput, emptyDraft, type ComposerDraft } from '../../composer'
  import {
    BTN_SM_CLASS,
    GHOST_BTN_CLASS,
    PRIMARY_BTN_CLASS,
    TEXTAREA_CLASS,
    TITLE_INPUT_CLASS,
    TITLE_MAX_LENGTH,
  } from '../../constants'
  import type { Composer } from '../../controllers/composer.svelte'
  import { CANCEL, DELETE_TASK_TITLE, NOTES, SERIES_EDIT_NOTE, TASK_NAME } from '../../messages'
  import { todayKey } from '../../today.svelte'
  import { isCoarsePointer } from '../../viewport.svelte'
  import DeleteConfirm from '../DeleteConfirm.svelte'
  import LabelPicker from './LabelPicker.svelte'
  import RecurrencePicker from './RecurrencePicker.svelte'
  import RecurringDeleteConfirm from './RecurringDeleteConfirm.svelte'
  import SchedulePicker from './SchedulePicker.svelte'

  let { composer }: { composer: Composer } = $props()

  const draft = $state<ComposerDraft>(untrack(() => emptyDraft(composer.initial)))
  const canSubmit = $derived(draft.title.trim().length > 0 && !composer.pending)

  function focus(node: HTMLElement) {
    // Editing on a phone shouldn't throw the keyboard over the sheet.
    if (draft.title && isCoarsePointer()) return
    // After the flush: opening a dialog in it runs showModal, which moves focus to its first control.
    void tick().then(() => node.focus())
  }

  function setRule(rule: string | null) {
    draft.date = dateForRule(draft, rule, todayKey())
    draft.rule = rule
  }

  function submit(event: SubmitEvent) {
    event.preventDefault()
    if (canSubmit) void composer.submit(draftToInput(draft))
  }
</script>

<form onsubmit={submit} class="space-y-4">
  <div class="space-y-3">
    <input
      bind:value={draft.title}
      use:focus
      type="text"
      placeholder={TASK_NAME}
      maxlength={TITLE_MAX_LENGTH}
      autocomplete="off"
      aria-label={TASK_NAME}
      class="w-full {TITLE_INPUT_CLASS}"
    />
    <textarea
      bind:value={draft.notes}
      rows="2"
      placeholder={NOTES}
      aria-label={NOTES}
      class="w-full resize-none {TEXTAREA_CLASS}"
    ></textarea>
  </div>

  <LabelPicker labels={composer.labels} bind:labelId={draft.labelId} />

  <SchedulePicker bind:date={draft.date} bind:time={draft.time} />

  <RecurrencePicker value={draft.rule} startDate={draft.date || null} onChange={setRule} />

  <div class="space-y-2 border-t border-lichen pt-3">
    {#if composer.editingSeries}
      <p class="text-xs text-sage">{SERIES_EDIT_NOTE}</p>
    {/if}
    <div class="flex items-center justify-between gap-3">
      {#if composer.onDelete && composer.onDeleteOccurrence}
        <RecurringDeleteConfirm {composer} />
      {:else if composer.onDelete}
        <DeleteConfirm
          onConfirm={composer.onDelete}
          title={DELETE_TASK_TITLE}
          detail={composer.editingTitle}
          busy={composer.pending}
        />
      {:else}
        <span></span>
      {/if}
      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onclick={composer.close}
          class="hit-area {GHOST_BTN_CLASS} {BTN_SM_CLASS}"
        >
          {CANCEL}
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          class="hit-area {PRIMARY_BTN_CLASS} {BTN_SM_CLASS}"
        >
          {composer.submitLabel}
        </button>
      </div>
    </div>
  </div>
</form>
