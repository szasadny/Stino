<script lang="ts">
  import {
    BTN_SM_CLASS,
    DESTRUCTIVE_BTN_CLASS,
    GHOST_BTN_CLASS,
    MODAL_BODY_CLASS,
  } from '../constants'
  import { autofocus } from '../dnd/autofocus.action'
  import { CANCEL, DELETE } from '../messages'
  import Modal from './Modal.svelte'

  let {
    onConfirm,
    title,
    detail,
    busy = false,
    compact = false,
    label = DELETE,
  }: {
    onConfirm: () => unknown
    title: string
    detail?: string
    busy?: boolean
    compact?: boolean
    label?: string
  } = $props()

  let open = $state(false)

  const size = $derived(compact ? 'hit-area-y px-2 py-1 text-xs' : `hit-area ${BTN_SM_CLASS}`)

  // Close first so a failure surfaces in the view or dialog underneath.
  function confirm() {
    open = false
    void onConfirm()
  }
</script>

<button
  type="button"
  onclick={() => (open = true)}
  disabled={busy}
  class="{DESTRUCTIVE_BTN_CLASS} {size}"
>
  {label}
</button>

{#if open}
  <Modal
    open
    onClose={() => (open = false)}
    {title}
    size="sm"
    dismiss="closerequest"
    containPresses
  >
    <div class="space-y-4 {MODAL_BODY_CLASS}">
      {#if detail}
        <p class="truncate text-sm text-sage">{detail}</p>
      {/if}
      <div class="flex justify-end gap-1">
        <button
          {@attach autofocus}
          type="button"
          onclick={() => (open = false)}
          class="hit-area {GHOST_BTN_CLASS} {BTN_SM_CLASS}"
        >
          {CANCEL}
        </button>
        <button
          type="button"
          onclick={confirm}
          disabled={busy}
          class="hit-area {DESTRUCTIVE_BTN_CLASS} {BTN_SM_CLASS}"
        >
          {DELETE}
        </button>
      </div>
    </div>
  </Modal>
{/if}
