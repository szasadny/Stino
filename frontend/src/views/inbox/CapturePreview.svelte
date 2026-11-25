<script lang="ts">
  import LabelChip from '../../lib/components/LabelChip.svelte'
  import Close from '../../lib/components/icons/Close.svelte'
  import Icon from '../../lib/components/icons/Icon.svelte'
  import type { CaptureLabel } from './quick-capture.svelte'

  let {
    label,
    preview,
    onClearLabel,
  }: { label: CaptureLabel | null; preview: string | null; onClearLabel: () => void } = $props()
</script>

{#if label || preview}
  <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-sage">
    {#if label}
      {#if 'label' in label}
        <span class="inline-flex items-center gap-1.5">
          <LabelChip label={label.label} />
          {#if label.chosen}
            <button
              type="button"
              onclick={onClearLabel}
              aria-label="Remove label"
              class="grid h-4 w-4 place-items-center rounded-full text-sage transition hover:bg-bark/10 hover:text-bark"
            >
              <Close class="h-3 w-3" strokeWidth={2.2} />
            </button>
          {/if}
        </span>
      {:else}
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-dashed border-pine/40 px-2.5 py-0.5 text-pine-deep"
        >
          <span aria-hidden="true">＋</span>
          <span class="truncate font-medium">{label.pending}</span>
          <span class="text-sage">new label</span>
        </span>
      {/if}
    {/if}
    {#if preview}
      <span class="inline-flex items-center gap-1">
        <Icon class="h-3.5 w-3.5 text-pine" strokeWidth={2}>
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </Icon>
        Scheduling for {preview}
      </span>
    {/if}
  </div>
{/if}
