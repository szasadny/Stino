<script lang="ts">
  // The first click arms deletion; the second confirms it.
  let {
    onConfirm,
    busy = false,
    compact = false,
  }: { onConfirm: () => void; busy?: boolean; compact?: boolean } = $props()

  let confirming = $state(false)

  const size = $derived(compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm')
</script>

{#if confirming}
  <div class="flex items-center gap-1">
    <span class="text-xs text-sage">Delete?</span>
    <button
      type="button"
      onclick={onConfirm}
      disabled={busy}
      class="rounded-lg font-medium text-bark transition hover:bg-bark/10 disabled:cursor-not-allowed disabled:opacity-40 {size}"
    >
      Yes
    </button>
    <button
      type="button"
      onclick={() => (confirming = false)}
      class="rounded-lg font-medium text-sage transition hover:text-pine-deep {size}"
    >
      No
    </button>
  </div>
{:else}
  <button
    type="button"
    onclick={() => (confirming = true)}
    disabled={busy}
    class="rounded-lg font-medium text-bark transition hover:bg-bark/10 disabled:cursor-not-allowed disabled:opacity-40 {size}"
  >
    Delete
  </button>
{/if}
