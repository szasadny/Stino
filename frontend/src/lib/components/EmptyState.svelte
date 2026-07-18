<script lang="ts">
  import Cairn from './Cairn.svelte'

  let { message }: { message: string } = $props()
</script>

<div
  class="grid place-items-center gap-3 rounded-2xl border border-dashed border-lichen bg-surface/50 px-6 py-14 text-center"
>
  <Cairn class="h-10 w-10 opacity-40" />
  <p class="max-w-xs text-sm text-sage">{message}</p>
</div>
