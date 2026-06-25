<script lang="ts">
  // The one modal shell. Owns the native <dialog> (top layer + Escape for free),
  // the open/close effect, the standard header (title + optional subtitle + close
  // button), and the backdrop/animation styles — so Settings, Labels, Import, and
  // the day sheet stop re-implementing all of that. The body is a `children`
  // snippet; `panelClass`/`containerClass` tune width and scroll per dialog.
  import type { Snippet } from 'svelte'

  let {
    open,
    onClose,
    onOpen,
    title,
    subtitle,
    panelClass = 'm-auto w-[min(30rem,calc(100vw-1.5rem))] rounded-2xl',
    containerClass = '',
    children,
  }: {
    open: boolean
    onClose: () => void
    // Fired once each time the dialog transitions to open — for dialogs that load
    // or reset state on open (Labels loads its list; Import clears its result).
    onOpen?: () => void
    title: string
    subtitle?: string
    // Extra <dialog> classes (width / positioning / max-height).
    panelClass?: string
    // Extra classes on the inner flex column (e.g. a max-height so the body scrolls).
    containerClass?: string
    children: Snippet
  } = $props()

  let dialogEl = $state<HTMLDialogElement | null>(null)

  $effect(() => {
    if (!dialogEl) return
    if (open) {
      if (!dialogEl.open) {
        dialogEl.showModal()
        onOpen?.()
      }
    } else if (dialogEl.open) {
      dialogEl.close()
    }
  })
</script>

<dialog
  bind:this={dialogEl}
  onclose={onClose}
  class="border border-lichen bg-surface p-0 text-ink shadow-xl {panelClass}"
>
  <div class="flex flex-col {containerClass}">
    <header class="flex items-start justify-between gap-4 border-b border-lichen px-5 py-4">
      <div>
        <h2 class="text-lg font-semibold text-pine-deep">{title}</h2>
        {#if subtitle}
          <p class="mt-0.5 text-sm text-sage">{subtitle}</p>
        {/if}
      </div>
      <button
        type="button"
        onclick={onClose}
        aria-label="Close"
        class="-mr-1 -mt-1 rounded-lg p-1.5 text-sage transition hover:bg-pine/5 hover:text-pine-deep"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          class="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    {@render children()}
  </div>
</dialog>

<style>
  dialog::backdrop {
    /* `--scrim` is the one chrome token kept fixed across themes (see app.css). */
    background: rgb(var(--scrim) / 0.32);
    backdrop-filter: blur(2px);
  }
  dialog[open] {
    animation: sheet-in 160ms ease-out;
  }
  @keyframes sheet-in {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    dialog[open] {
      animation: none;
    }
  }
</style>
