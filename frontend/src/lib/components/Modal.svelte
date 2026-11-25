<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { Attachment } from 'svelte/attachments'
  import { MODAL_SIZES, type ModalSize } from '../constants'
  import PanelHeader from './PanelHeader.svelte'

  let {
    open,
    onClose,
    onOpen,
    title,
    subtitle,
    label,
    size = 'md',
    header,
    children,
  }: {
    open: boolean
    onClose: () => void
    onOpen?: () => void
    title?: string
    subtitle?: string
    label?: string
    size?: ModalSize
    header?: Snippet
    children: Snippet
  } = $props()

  const titleId = $props.id()
  let dialogEl = $state<HTMLDialogElement | null>(null)
  let opener: Element | null = null
  let destroyed = false

  $effect(() => {
    if (!dialogEl) return
    if (open) {
      if (!dialogEl.open) {
        opener = document.activeElement
        dialogEl.showModal()
        onOpen?.()
      }
    } else if (dialogEl.open) {
      dialogEl.close()
    }
  })

  // Teardown runs after the dialog left the DOM, where the browser does not return focus.
  const closeOnDestroy: Attachment<HTMLDialogElement> = (dialog) => () => {
    destroyed = true
    if (!dialog.open) return
    dialog.close()
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
  }

  function handleClose() {
    if (!destroyed) onClose()
  }

  // Light-dismiss fallback for browsers lacking `closedby` (notably Safari).
  function handleBackdropClick(event: MouseEvent) {
    if (!dialogEl || 'closedBy' in HTMLDialogElement.prototype) return
    if (event.target !== dialogEl) return
    const rect = dialogEl.getBoundingClientRect()
    const insideContent =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width
    if (!insideContent) onClose()
  }
</script>

<dialog
  bind:this={dialogEl}
  {@attach closeOnDestroy}
  closedby="any"
  aria-labelledby={title && !header ? titleId : undefined}
  aria-label={label}
  onclose={handleClose}
  onclick={handleBackdropClick}
  class="border border-lichen bg-surface p-0 text-ink shadow-overlay backdrop:bg-scrim backdrop:backdrop-blur-scrim {MODAL_SIZES[
    size
  ].panel}"
>
  <div class="flex flex-col {MODAL_SIZES[size].container}">
    {#if header}
      {@render header()}
    {:else if title}
      <PanelHeader {title} {subtitle} {onClose} {titleId} />
    {/if}

    {@render children()}
  </div>
</dialog>

<style>
  dialog[open] {
    animation: sheet-in var(--duration-dialog) ease-out;
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
