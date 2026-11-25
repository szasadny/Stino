<script lang="ts">
  import Icon from './Icon.svelte'

  const PATHS = {
    left: 'M15 18l-6-6 6-6',
    right: 'M9 6l6 6-6 6',
    up: 'M18 15l-6-6-6 6',
    down: 'M6 9l6 6 6-6',
  } as const

  let { dir, class: className = 'h-5 w-5' }: { dir: keyof typeof PATHS; class?: string } = $props()
</script>

<Icon class={className} strokeWidth={2}>
  <path d={PATHS[dir]} />
</Icon>
