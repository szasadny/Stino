<script lang="ts">
  import { tick } from 'svelte'
  import Modal from '../../lib/components/Modal.svelte'
  import ReorderList from '../../lib/components/ReorderList.svelte'
  import { MODAL_BODY_CLASS, MUTED_CENTER_CLASS } from '../../lib/constants'
  import { createDropList } from '../../lib/controllers/drop-list.svelte'
  import { LOADING } from '../../lib/messages'
  import type { Label } from '../../lib/types'
  import { isCoarsePointer } from '../../lib/viewport.svelte'
  import { createLabelStore } from './label-store.svelte'
  import LabelForm from './LabelForm.svelte'
  import LabelRow from './LabelRow.svelte'

  let { open, onClose }: { open: boolean; onClose: () => void } = $props()

  const store = createLabelStore()
  const drop = createDropList(() => ({ labels: store.labels }))
  let editingId = $state<number | null>(null)
  let returnFocusId = $state<number | null>(null)
  let createForm = $state<ReturnType<typeof LabelForm> | null>(null)
  const reorderable = $derived(store.labels.length > 1 && editingId === null && !store.pending)

  function onOpen() {
    editingId = null
    returnFocusId = null
    void store.load()
    // On a phone the keyboard would cover the list.
    if (!isCoarsePointer()) createForm?.focus()
  }

  function edit(id: number) {
    editingId = id
    returnFocusId = null
    store.clearError()
  }

  // One-shot, so a later remount of that row never pulls focus again.
  function endRename(): boolean {
    if (editingId === null) return false
    returnFocusId = editingId
    editingId = null
    void tick().then(() => (returnFocusId = null))
    return true
  }

  function finalize(items: Label[]) {
    drop.finalize('labels', items)
    drop.settle(store.reorder(items.map((l) => l.id)))
  }
</script>

<Modal
  {open}
  {onClose}
  {onOpen}
  onEscape={endRename}
  title="Labels"
  subtitle="Color tags you can assign to tasks."
  size="lg"
  error={store.error}
>
  <LabelForm
    bind:this={createForm}
    busy={store.pending}
    onSubmit={store.create}
    class="border-b border-lichen {MODAL_BODY_CLASS}"
  />

  <div class="flex-1 overflow-y-auto {MODAL_BODY_CLASS}">
    {#if store.loading}
      <p class="{MUTED_CENTER_CLASS} py-6">{LOADING}</p>
    {:else if store.labels.length === 0}
      <p class="{MUTED_CENTER_CLASS} py-6">No labels yet. Create your first above.</p>
    {:else}
      <ReorderList
        items={drop.lists.labels}
        disabled={!reorderable}
        class="space-y-2"
        onConsider={(e) => drop.consider('labels', e.detail.items)}
        onFinalize={(e) => finalize(e.detail.items)}
      >
        {#snippet item(label, handle)}
          <LabelRow
            {label}
            {store}
            handle={reorderable ? handle : null}
            editing={editingId === label.id}
            onEdit={() => edit(label.id)}
            returnFocus={returnFocusId === label.id}
            onDone={endRename}
          />
        {/snippet}
      </ReorderList>
    {/if}
  </div>
</Modal>
