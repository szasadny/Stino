<script lang="ts">
  // A completed occurrence is history, so "This occurrence" is disabled for it.
  import { BTN_SM_CLASS, DESTRUCTIVE_BTN_CLASS, GHOST_BTN_CLASS } from '../../constants'
  import type { Composer } from '../../controllers/composer.svelte'
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
  Delete
</button>

<Modal
  {open}
  onClose={() => (open = false)}
  title="Delete recurring task"
  subtitle="This task repeats."
  size="sm"
>
  <div class="space-y-2 px-5 py-4">
    <button
      type="button"
      onclick={() => choose(composer.onDeleteOccurrence)}
      disabled={composer.pending || !canDeleteOccurrence}
      aria-describedby={canDeleteOccurrence ? undefined : noteId}
      class={choiceClass}
    >
      This occurrence
      {#if canDeleteOccurrence}
        <span class="mt-0.5 block text-xs font-normal text-sage">The series keeps repeating.</span>
      {/if}
    </button>
    {#if !canDeleteOccurrence}
      <!-- Outside the faded button so the reason stays legible. -->
      <p id={noteId} class="px-1 text-xs text-sage">Completed, so it’s kept in your history.</p>
    {/if}
    <button
      type="button"
      onclick={() => choose(composer.onDelete)}
      disabled={composer.pending}
      class={choiceClass}
    >
      Whole series
      <span class="mt-0.5 block text-xs font-normal text-sage"
        >Every past and future occurrence.</span
      >
    </button>
    <button
      type="button"
      onclick={() => (open = false)}
      class="{GHOST_BTN_CLASS} w-full px-4 py-2.5 text-sm"
    >
      Cancel
    </button>
  </div>
</Modal>
