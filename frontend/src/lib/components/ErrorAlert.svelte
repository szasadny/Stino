<script lang="ts">
  import Icon from './icons/Icon.svelte'

  let { error, class: className = '' }: { error: string | null; class?: string } = $props()
</script>

{#if error}
  <div
    role="alert"
    class="flex items-start gap-2 rounded-lg border border-bark/30 bg-bark/10 px-3 py-2 text-sm text-bark {className}"
  >
    <Icon class="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2}>
      <path
        d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
      />
      <path d="M12 9v4M12 17h.01" />
    </Icon>
    <span class="min-w-0">{error}</span>
  </div>
{/if}
