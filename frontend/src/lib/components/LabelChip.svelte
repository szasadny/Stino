<script lang="ts">
  // Reusable label pill: a color dot, an optional emoji, and the label name. The
  // dot uses the label's own color (user data — the one allowed exception to the
  // design tokens); the surrounding chrome stays in the calm forest palette.
  let {
    name,
    color,
    emoji = null,
  }: { name: string; color: string; emoji?: string | null } = $props()
</script>

<span
  class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-lichen bg-surface px-2.5 py-0.5 text-xs font-medium text-ink"
>
  <span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {color}"></span>
  {#if emoji}
    <span class="shrink-0 text-sm leading-none" aria-hidden="true">{emoji}</span>
  {/if}
  <span class="truncate">{name}</span>
</span>
