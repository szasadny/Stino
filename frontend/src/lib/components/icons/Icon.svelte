<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    class: className,
    strokeWidth,
    children,
  }: { class: string; strokeWidth: number; children: Snippet } = $props()
</script>

<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  aria-hidden="true"
>
  {@render children()}
</svg>
