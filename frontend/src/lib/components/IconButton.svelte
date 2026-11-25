<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  let {
    label,
    class: className = '',
    children,
    ...rest
  }: { label: string; class?: string; children: Snippet } & Omit<
    HTMLButtonAttributes,
    'class' | 'children' | 'aria-label' | 'type'
  > = $props()
</script>

<button
  type="button"
  aria-label={label}
  class="rounded-lg p-1.5 text-sage transition hover:bg-pine/5 hover:text-pine-deep {className}"
  {...rest}
>
  {@render children()}
</button>
