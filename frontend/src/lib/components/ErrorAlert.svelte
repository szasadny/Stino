<script lang="ts">
  // The shared error banner — the bark-toned alert every view and dialog shows
  // on a failed load or action. The base styling lives here once; callers pass
  // only positioning (margins) through `class`. Renders nothing when `error` is
  // null/empty, so it can sit unconditionally in markup.
  let { error, class: className = '' }: { error: string | null; class?: string } = $props()
</script>

{#if error}
  <div
    role="alert"
    class="flex items-start gap-2 rounded-lg border border-bark/30 bg-bark/10 px-3 py-2 text-sm text-bark {className}"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="mt-0.5 h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      <path
        d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
      />
      <path d="M12 9v4M12 17h.01" />
    </svg>
    <span class="min-w-0">{error}</span>
  </div>
{/if}
