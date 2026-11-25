<script lang="ts">
  import Icon from '../../lib/components/icons/Icon.svelte'

  let { class: className = 'h-5 w-5', strokeWidth = 2 }: { class?: string; strokeWidth?: number } =
    $props()
</script>

<Icon class={className} {strokeWidth}>
  <path d="M19 12H5" />
  <path d="M12 19l-7-7 7-7" />
</Icon>
