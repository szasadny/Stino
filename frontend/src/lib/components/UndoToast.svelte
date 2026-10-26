<script lang="ts">
  import { UNDO_TOAST_MS } from '../constants'

  let {
    message,
    token,
    busy = false,
    onUndo,
    onDismiss,
  }: {
    message: string | null
    // Bumped per show so a replacing toast restarts the timer even with the same message.
    token: number
    busy?: boolean
    onUndo: () => void
    onDismiss: () => void
  } = $props()

  $effect(() => {
    void token
    if (!message) return
    const timer = setTimeout(() => onDismiss(), UNDO_TOAST_MS)
    return () => clearTimeout(timer)
  })
</script>

<!-- The live region stays mounted so screen readers announce each new message. -->
<div
  role="status"
  aria-live="polite"
  class="pointer-events-none absolute inset-x-4 bottom-4 z-30 flex justify-center"
>
  {#if message}
    <div
      class="pointer-events-auto flex w-full max-w-sm animate-rise-in items-center gap-3 rounded-xl border border-lichen bg-surface py-1.5 pl-4 pr-1.5 shadow-overlay"
    >
      <span class="min-w-0 flex-1 truncate text-sm text-ink">{message}</span>
      <button
        type="button"
        onclick={onUndo}
        disabled={busy}
        class="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-pine transition hover:bg-pine/5 disabled:opacity-40 sm:min-h-9"
      >
        Undo
      </button>
    </div>
  {/if}
</div>
