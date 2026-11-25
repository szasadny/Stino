<script lang="ts">
  import ErrorAlert from '../../lib/components/ErrorAlert.svelte'
  import Modal from '../../lib/components/Modal.svelte'
  import ReorderList from '../../lib/components/ReorderList.svelte'
  import { MUTED_CENTER_CLASS } from '../../lib/constants'
  import { createDropList } from '../../lib/controllers/drop-list.svelte'
  import { LOADING } from '../../lib/messages'
  import type { Label } from '../../lib/types'
  import { createLabelStore } from './label-store.svelte'
  import LabelForm from './LabelForm.svelte'
  import LabelRow from './LabelRow.svelte'

  let { open, onClose }: { open: boolean; onClose: () => void } = $props()

  const store = createLabelStore()
  const drop = createDropList(() => ({ labels: store.labels }))
  let editingId = $state<number | null>(null)
  let createForm = $state<ReturnType<typeof LabelForm> | null>(null)
  const reorderable = $derived(store.labels.length > 1 && editingId === null && !store.pending)

  function onOpen() {
    void store.load()
    createForm?.focus()
  }

  function edit(id: number) {
    editingId = id
    store.clearError()
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
  title="Labels"
  subtitle="Color tags you can assign to tasks."
  size="lg"
>
  <ErrorAlert error={store.error} class="mx-5 mt-4" />

  <LabelForm
    bind:this={createForm}
    busy={store.pending}
    onSubmit={store.create}
    class="border-b border-lichen px-5 py-4"
  />

  <div class="flex-1 overflow-y-auto px-5 py-4">
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
            onDone={() => (editingId = null)}
          />
        {/snippet}
      </ReorderList>
    {/if}
  </div>
</Modal>
