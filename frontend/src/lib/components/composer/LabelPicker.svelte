<script lang="ts">
  import { FIELD_LABEL_CLASS } from '../../constants'
  import type { Label } from '../../types'
  import LabelMark from '../LabelMark.svelte'
  import ToggleChip from './ToggleChip.svelte'

  let { labels, labelId = $bindable() }: { labels: Label[]; labelId: number | null } = $props()

  function pick(id: number | null) {
    labelId = labelId === id ? null : id
  }
</script>

{#if labels.length > 0}
  <div class="space-y-1.5">
    <span class={FIELD_LABEL_CLASS}>Label</span>
    <div class="flex flex-wrap gap-1.5">
      <ToggleChip
        pressed={labelId === null}
        onclick={() => pick(null)}
        class="rounded-full px-2.5 py-1"
      >
        None
      </ToggleChip>
      {#each labels as label (label.id)}
        <ToggleChip
          pressed={labelId === label.id}
          onclick={() => pick(label.id)}
          class="flex items-center gap-1.5 rounded-full px-2.5 py-1"
        >
          <LabelMark {label} look="toggle" />
        </ToggleChip>
      {/each}
    </div>
  </div>
{/if}
