<script lang="ts">
  import Icon from './Icon.svelte'

  let { class: className = 'h-5 w-5', strokeWidth = 2 }: { class?: string; strokeWidth?: number } =
    $props()
</script>

<Icon class={className} {strokeWidth}>
  <path d="M12 5v14M5 12h14" />
</Icon>
