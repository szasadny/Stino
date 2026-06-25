<script lang="ts">
  // The calm "nothing here" panel, shared by the list views (Inbox, Today,
  // Search) so the empty-state styling is defined once. The cairn mark keeps it
  // on-brand and warm rather than a bare dashed box.
  import Cairn from './Cairn.svelte'

  let { message }: { message: string } = $props()
</script>

<div
  class="grid place-items-center gap-3 rounded-2xl border border-dashed border-lichen bg-surface/50 px-6 py-14 text-center"
>
  <Cairn class="h-10 w-10 opacity-40" />
  <p class="max-w-xs text-sm text-sage">{message}</p>
</div>
