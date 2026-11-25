<script lang="ts">
  import type { Snippet } from 'svelte'
  import { CHIP_OFF_CLASS, CHIP_ON_CLASS } from '../../constants'

  let {
    pressed,
    onclick,
    title,
    class: className = 'rounded-lg px-2.5 py-1.5',
    children,
  }: {
    pressed: boolean
    onclick: () => void
    title?: string
    class?: string
    children: Snippet
  } = $props()
</script>

<button
  type="button"
  {onclick}
  {title}
  aria-pressed={pressed}
  class="border text-xs font-medium transition {className} {pressed
    ? CHIP_ON_CLASS
    : CHIP_OFF_CLASS}"
>
  {@render children()}
</button>
