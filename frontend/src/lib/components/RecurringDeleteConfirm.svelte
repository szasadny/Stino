<script lang="ts">
  // A completed occurrence is history, so "This occurrence" is disabled for it.
  import Modal from './Modal.svelte'

  let {
    onDeleteOccurrence,
    onDeleteSeries,
    busy = false,
    canDeleteOccurrence = true,
  }: {
    onDeleteOccurrence: () => void
    onDeleteSeries: () => void
    busy?: boolean
    canDeleteOccurrence?: boolean
  } = $props()

  let open = $state(false)
  const noteId = $props.id()

  // Close the popup first so an error surfaces in the editor underneath.
  function choose(action: () => void) {
    open = false
    action()
  }

  const choiceClass =
    'w-full rounded-lg border border-lichen px-4 py-2.5 text-left text-sm font-medium text-bark transition enabled:hover:border-bark/40 enabled:hover:bg-bark/10 disabled:cursor-not-allowed disabled:opacity-40'
</script>

<button
  type="button"
  onclick={() => (open = true)}
  disabled={busy}
  class="rounded-lg px-3 py-1.5 text-sm font-medium text-bark transition hover:bg-bark/10 disabled:cursor-not-allowed disabled:opacity-40"
>
  Delete
</button>

<Modal
  {open}
  onClose={() => (open = false)}
  title="Delete recurring task"
  subtitle="This task repeats."
  panelClass="m-auto w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl"
>
  <div class="space-y-2 px-5 py-4">
    <button
      type="button"
      onclick={() => choose(onDeleteOccurrence)}
      disabled={busy || !canDeleteOccurrence}
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
      <p id={noteId} class="px-1 text-xs text-sage">Completed — kept in your history.</p>
    {/if}
    <button
      type="button"
      onclick={() => choose(onDeleteSeries)}
      disabled={busy}
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
      class="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-sage transition hover:text-pine-deep"
    >
      Cancel
    </button>
  </div>
</Modal>
