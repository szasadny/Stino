<script lang="ts">
  // A completed occurrence is history, so "This occurrence" is disabled for it.
  import {
    BTN_SM_CLASS,
    DESTRUCTIVE_BTN_CLASS,
    GHOST_BTN_CLASS,
    MODAL_BODY_CLASS,
  } from '../../constants'
  import type { Composer } from '../../controllers/composer.svelte'
  import { autofocus } from '../../dnd/autofocus.action'
  import {
    CANCEL,
    COMPLETED_OCCURRENCE_KEPT,
    DELETE,
    DELETE_RECURRING_TITLE,
    EVERY_OCCURRENCE,
    SERIES_KEEPS_REPEATING,
    TASK_REPEATS,
    THIS_OCCURRENCE,
    WHOLE_SERIES,
  } from '../../messages'
  import Modal from '../Modal.svelte'

  let { composer }: { composer: Composer } = $props()

  let open = $state(false)
  const noteId = $props.id()
  const canDeleteOccurrence = $derived(composer.canDeleteOccurrence)

  // Close the popup first so an error surfaces in the editor underneath.
  function choose(action: (() => Promise<void>) | undefined) {
    open = false
    void action?.()
  }

  const choiceClass =
    'w-full rounded-lg border border-lichen px-4 py-2.5 text-left text-sm font-medium text-bark transition enabled:hover:border-bark/40 enabled:hover:bg-bark/10 disabled:cursor-not-allowed disabled:opacity-40'
</script>

<button
  type="button"
  onclick={() => (open = true)}
  disabled={composer.pending}
  class="{DESTRUCTIVE_BTN_CLASS} {BTN_SM_CLASS}"
>
  {DELETE}
</button>

<Modal
  {open}
  onClose={() => (open = false)}
  title={DELETE_RECURRING_TITLE}
  subtitle={TASK_REPEATS}
  size="sm"
  dismiss="closerequest"
>
  <div class="space-y-2 {MODAL_BODY_CLASS}">
    <button
      type="button"
      onclick={() => choose(composer.onDeleteOccurrence)}
      disabled={composer.pending || !canDeleteOccurrence}
      aria-describedby={canDeleteOccurrence ? undefined : noteId}
      class={choiceClass}
    >
      {THIS_OCCURRENCE}
      {#if canDeleteOccurrence}
        <span class="mt-0.5 block text-xs font-normal text-sage">{SERIES_KEEPS_REPEATING}</span>
      {/if}
    </button>
    {#if !canDeleteOccurrence}
      <!-- Outside the faded button so the reason stays legible. -->
      <p id={noteId} class="px-1 text-xs text-sage">{COMPLETED_OCCURRENCE_KEPT}</p>
    {/if}
    <button
      type="button"
      onclick={() => choose(composer.onDelete)}
      disabled={composer.pending}
      class={choiceClass}
    >
      {WHOLE_SERIES}
      <span class="mt-0.5 block text-xs font-normal text-sage">{EVERY_OCCURRENCE}</span>
    </button>
    <button
      {@attach autofocus}
      type="button"
      onclick={() => (open = false)}
      class="{GHOST_BTN_CLASS} w-full px-4 py-2.5 text-sm"
    >
      {CANCEL}
    </button>
  </div>
</Modal>
