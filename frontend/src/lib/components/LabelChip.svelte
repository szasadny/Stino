<script lang="ts">
  import type { Label } from '../types'
  import LabelMark from './LabelMark.svelte'

  let { label }: { label: Pick<Label, 'name' | 'color' | 'emoji'> } = $props()
</script>

<span
  class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-lichen bg-surface px-2.5 py-0.5 text-xs font-medium text-ink"
>
  <LabelMark {label} look="chip" />
</span>
