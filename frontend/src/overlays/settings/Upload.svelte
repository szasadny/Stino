<script lang="ts">
  import Icon from '../../lib/components/icons/Icon.svelte'

  let {
    class: className = 'h-4 w-4',
    strokeWidth = 1.8,
  }: { class?: string; strokeWidth?: number } = $props()
</script>

<Icon class={className} {strokeWidth}>
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
  <path d="M7 10l5-5 5 5" />
  <path d="M12 5v12" />
</Icon>
