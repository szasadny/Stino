<script lang="ts">
  import Icon from './Icon.svelte'

  let { class: className = 'h-5 w-5', strokeWidth = 2 }: { class?: string; strokeWidth?: number } =
    $props()
</script>

<Icon class={className} {strokeWidth}>
  <path d="M5 13l4 4L19 7" />
</Icon>
