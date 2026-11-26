<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { Attachment } from 'svelte/attachments'
  import { on } from 'svelte/events'
  import { MODAL_SIZES, type ModalSize } from '../constants'
  import { returnFocusOnDestroy, type FocusTarget } from '../dnd/focus-return.action'
  import ErrorAlert from './ErrorAlert.svelte'
  import PanelHeader from './PanelHeader.svelte'

  let {
    open,
    onClose,
    onOpen,
    onEscape,
    onHeaderClose,
    title,
    subtitle,
    label,
    size = 'md',
    dismiss = 'any',
    error,
    header,
    children,
  }: {
    open: boolean
    onClose: () => void
    onOpen?: () => void
    onEscape?: () => boolean
    onHeaderClose?: () => void
    title?: string
    subtitle?: string
    label?: string
    size?: ModalSize
    dismiss?: 'any' | 'closerequest'
    error?: string | null
    header?: Snippet
    children: Snippet
  } = $props()

  const titleId = $props.id()
  let dialogEl = $state<HTMLDialogElement | null>(null)
  let opener: FocusTarget | null = null
  let destroyed = false
  let pressedOutside = false

  $effect(() => {
    if (!dialogEl) return
    if (open) {
      if (!dialogEl.open) {
        opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
        dialogEl.showModal()
        onOpen?.()
      }
    } else if (dialogEl.open) {
      dialogEl.close()
    }
  })

  const closeOnDestroy = returnFocusOnDestroy<HTMLDialogElement>(
    () => opener,
    (dialog) => {
      destroyed = true
      if (!dialog.open) return false
      dialog.close()
      return true
    },
  )

  function handleClose() {
    if (!destroyed) onClose()
  }

  // A cancelled keydown issues no close request; `cancel` would also fire on an outside click.
  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.isComposing || !onEscape) return
    if (!(event.target instanceof Element) || event.target.closest('dialog') !== dialogEl) return
    if (!onEscape()) return
    event.preventDefault()
    event.stopPropagation()
  }

  // Light-dismiss fallback for browsers lacking `closedby` (notably Safari).
  function outsideContent(event: PointerEvent): boolean {
    if (!dialogEl || dismiss !== 'any' || 'closedBy' in HTMLDialogElement.prototype) return false
    if (event.target !== event.currentTarget) return false
    const rect = dialogEl.getBoundingClientRect()
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
  }

  // Presses must not reach a drag item or row the DOM sits in; releases stay free for in-dialog drags.
  // `on` runs Svelte's delegated handlers inside the dialog before the stop.
  const containPresses: Attachment<HTMLDialogElement> = (dialog) => {
    const stop = (event: Event) => event.stopPropagation()
    const offs = [
      on(dialog, 'pointerdown', (event) => {
        pressedOutside = outsideContent(event)
        stop(event)
      }),
      on(dialog, 'mousedown', stop),
      on(dialog, 'touchstart', stop, { passive: true }),
      on(dialog, 'click', stop),
    ]
    return () => offs.forEach((off) => off())
  }

  // Press and release both outside, so a text selection dragged onto the backdrop keeps it open.
  function handlePointerUp(event: PointerEvent) {
    if (pressedOutside && outsideContent(event)) dialogEl?.close()
    pressedOutside = false
  }
</script>

<dialog
  bind:this={dialogEl}
  {@attach closeOnDestroy}
  {@attach containPresses}
  closedby={dismiss}
  aria-labelledby={title && !header ? titleId : undefined}
  aria-label={label}
  onclose={handleClose}
  onkeydown={handleKeydown}
  onpointerup={handlePointerUp}
  class="border border-lichen bg-surface p-0 text-ink shadow-overlay backdrop:bg-scrim backdrop:backdrop-blur-scrim {MODAL_SIZES[
    size
  ].panel}"
>
  <div class="flex flex-col {MODAL_SIZES[size].container}">
    {#if header}
      {@render header()}
    {:else if title}
      <PanelHeader {title} {subtitle} onClose={onHeaderClose ?? onClose} {titleId} />
    {/if}

    <ErrorAlert error={open ? (error ?? null) : null} class="mx-5 mt-4 shrink-0" />

    {@render children()}
  </div>
</dialog>

<style>
  dialog:modal {
    overscroll-behavior: contain;
  }
  dialog::backdrop {
    overflow: hidden;
    overscroll-behavior: contain;
  }
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
