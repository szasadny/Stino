<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'
  import { ICON_BTN_CLASS } from '../constants'

  const SIZES = { sm: 'grid h-6 w-6 place-items-center', md: 'p-1.5' }

  let {
    label,
    size = 'md',
    class: className = '',
    children,
    ...rest
  }: { label: string; size?: keyof typeof SIZES; class?: string; children: Snippet } & Omit<
    HTMLButtonAttributes,
    'class' | 'children' | 'aria-label' | 'type'
  > = $props()
</script>

<button
  type="button"
  aria-label={label}
  title={label}
  class="{ICON_BTN_CLASS} {SIZES[size]} {className}"
  {...rest}
>
  {@render children()}
</button>
