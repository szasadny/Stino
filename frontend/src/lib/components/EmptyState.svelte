<script lang="ts">
  // The calm dashed-border "nothing here" panel, shared by the list views (Inbox,
  // Today, Search) so the empty-state styling is defined once.
  let { message }: { message: string } = $props()
</script>

<div
  class="grid place-items-center rounded-xl border border-dashed border-lichen bg-surface/60 px-4 py-12 text-center"
>
  <p class="max-w-xs text-sm text-sage">{message}</p>
</div>
