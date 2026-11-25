<script lang="ts">
  import { CLEAR_BTN_CLASS, COMPACT_INPUT_CLASS } from '../../constants'

  let {
    until,
    startDate,
    onChange,
  }: {
    until: string | null
    startDate: string | null
    onChange: (until: string | null) => void
  } = $props()
</script>

<div class="flex flex-wrap items-center gap-2">
  <span class="text-xs text-sage">Ends</span>
  <input
    type="date"
    value={until ?? ''}
    min={startDate ?? undefined}
    onchange={(e) => onChange(e.currentTarget.value || null)}
    aria-label="Repeat end date"
    class={COMPACT_INPUT_CLASS}
  />
  {#if until}
    <button type="button" onclick={() => onChange(null)} class="{CLEAR_BTN_CLASS} py-1">
      Clear
    </button>
  {:else}
    <span class="text-xs text-sage">never</span>
  {/if}
</div>
