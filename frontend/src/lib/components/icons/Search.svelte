<script lang="ts">
  import Icon from './Icon.svelte'

  let { class: className = 'h-5 w-5', strokeWidth = 2 }: { class?: string; strokeWidth?: number } =
    $props()
</script>

<Icon class={className} {strokeWidth}>
  <circle cx="11" cy="11" r="7" />
  <path d="M21 21l-3.5-3.5" />
</Icon>
