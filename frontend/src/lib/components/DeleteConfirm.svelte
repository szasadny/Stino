<script lang="ts">
  import { DESTRUCTIVE_BTN_CLASS } from '../constants'

  let {
    onConfirm,
    busy = false,
    compact = false,
    label = 'Delete',
  }: { onConfirm: () => unknown; busy?: boolean; compact?: boolean; label?: string } = $props()

  let confirming = $state(false)

  const size = $derived(compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm')

  // Disarm once settled: a success usually unmounts this, a failure must not stay one click away.
  async function confirm() {
    try {
      await onConfirm()
    } finally {
      confirming = false
    }
  }
</script>

{#if confirming}
  <div class="flex items-center gap-1">
    <span class="text-xs text-sage">{label}?</span>
    <button type="button" onclick={confirm} disabled={busy} class="{DESTRUCTIVE_BTN_CLASS} {size}">
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
    class="{DESTRUCTIVE_BTN_CLASS} {size}"
  >
    {label}
  </button>
{/if}
