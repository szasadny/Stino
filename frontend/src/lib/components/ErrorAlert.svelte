<script lang="ts">
  // The shared error banner — the bark-toned alert every view and dialog shows
  // on a failed load or action. The base styling lives here once; callers pass
  // only positioning (margins) through `class`. Renders nothing when `error` is
  // null/empty, so it can sit unconditionally in markup.
  let { error, class: className = '' }: { error: string | null; class?: string } = $props()
</script>

{#if error}
  <p
    role="alert"
    class="rounded-lg border border-bark/30 bg-bark/10 px-3 py-2 text-sm text-bark {className}"
  >
    {error}
  </p>
{/if}
