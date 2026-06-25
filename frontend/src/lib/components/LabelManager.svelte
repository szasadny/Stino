<script lang="ts">
  // Manage labels: create, rename, recolor, delete. The dialog shell (header,
  // close, backdrop, open/close) lives in Modal; this owns the list and the
  // create/edit forms. Loads its list and focuses the name field each time it
  // opens (via Modal's onOpen).
  import { api, type LabelInput } from '../api'
  import { LABEL_NAME_MAX_LENGTH, LABEL_PALETTE } from '../constants'
  import { errorMessage } from '../errors'
  import type { Label } from '../types'
  import LabelChip from './LabelChip.svelte'
  import Modal from './Modal.svelte'

  let { open, onClose }: { open: boolean; onClose: () => void } = $props()

  let nameInput = $state<HTMLInputElement | null>(null)

  let labels = $state<Label[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let busy = $state(false)

  // Create draft.
  let newName = $state('')
  let newColor = $state<string>(LABEL_PALETTE[0].hex)

  // Inline edit / delete-confirm state (one row at a time).
  let editingId = $state<number | null>(null)
  let editName = $state('')
  let editColor = $state('')
  let confirmingId = $state<number | null>(null)

  function onOpen() {
    void load()
    nameInput?.focus()
  }

  async function load() {
    loading = true
    error = null
    try {
      labels = await api.labels.list()
    } catch (e) {
      error = errorMessage(e, 'Could not load labels')
    } finally {
      loading = false
    }
  }

  async function create() {
    const name = newName.trim()
    if (!name || busy) return
    busy = true
    error = null
    try {
      const created = await api.labels.create({ name, color: newColor })
      labels = [...labels, created]
      newName = ''
      newColor = LABEL_PALETTE[0].hex
      nameInput?.focus()
    } catch (e) {
      error = errorMessage(e, 'Could not create label')
    } finally {
      busy = false
    }
  }

  function startEdit(label: Label) {
    editingId = label.id
    editName = label.name
    editColor = label.color
    confirmingId = null
    error = null
  }

  async function saveEdit(id: number) {
    const name = editName.trim()
    if (!name || busy) return
    busy = true
    error = null
    try {
      const patch: Partial<LabelInput> = { name, color: editColor }
      const updated = await api.labels.update(id, patch)
      labels = labels.map((l) => (l.id === id ? updated : l))
      editingId = null
    } catch (e) {
      error = errorMessage(e, 'Could not save label')
    } finally {
      busy = false
    }
  }

  async function remove(id: number) {
    if (busy) return
    busy = true
    error = null
    try {
      await api.labels.remove(id)
      labels = labels.filter((l) => l.id !== id)
      confirmingId = null
    } catch (e) {
      error = errorMessage(e, 'Could not delete label')
    } finally {
      busy = false
    }
  }
</script>

{#snippet swatches(selected: string, onpick: (hex: string) => void)}
  <div class="flex flex-wrap gap-2" role="group" aria-label="Label color">
    {#each LABEL_PALETTE as swatch (swatch.hex)}
      <button
        type="button"
        onclick={() => onpick(swatch.hex)}
        title={swatch.name}
        aria-label={swatch.name}
        aria-pressed={selected === swatch.hex}
        class="h-6 w-6 rounded-full ring-offset-2 ring-offset-surface transition {selected ===
        swatch.hex
          ? 'ring-2 ring-pine'
          : 'ring-1 ring-lichen hover:ring-sage'}"
        style="background-color: {swatch.hex}"
      ></button>
    {/each}
  </div>
{/snippet}

<Modal
  {open}
  {onClose}
  {onOpen}
  title="Labels"
  subtitle="Color tags you can assign to tasks."
  panelClass="m-auto max-h-[85vh] w-[min(34rem,calc(100vw-1.5rem))] rounded-2xl"
  containerClass="max-h-[85vh]"
>
  {#if error}
    <p
      role="alert"
      class="mx-5 mt-4 rounded-lg border border-bark/30 bg-bark/10 px-3 py-2 text-sm text-bark"
    >
      {error}
    </p>
  {/if}

  <!-- Create a new label -->
  <form
    class="border-b border-lichen px-5 py-4"
    onsubmit={(e) => {
      e.preventDefault()
      create()
    }}
  >
    <label for="new-label-name" class="block text-sm font-medium text-ink">New label</label>
    <div class="mt-2 flex items-center gap-2">
      <input
        id="new-label-name"
        bind:this={nameInput}
        bind:value={newName}
        type="text"
        placeholder="e.g. Home"
        maxlength={LABEL_NAME_MAX_LENGTH}
        autocomplete="off"
        class="min-w-0 flex-1 rounded-lg border border-lichen bg-fog px-3 py-2 text-sm text-ink outline-none transition placeholder:text-sage focus:border-pine focus:bg-surface"
      />
      <button
        type="submit"
        disabled={!newName.trim() || busy}
        class="shrink-0 rounded-lg bg-pine px-4 py-2 text-sm font-medium text-surface transition hover:bg-pine-deep disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add
      </button>
    </div>
    <div class="mt-3">
      {@render swatches(newColor, (hex) => (newColor = hex))}
    </div>
  </form>

  <!-- Existing labels -->
  <div class="flex-1 overflow-y-auto px-5 py-4">
    {#if loading}
      <p class="py-6 text-center text-sm text-sage">Loading…</p>
    {:else if labels.length === 0}
      <p class="py-6 text-center text-sm text-sage">No labels yet — create your first above.</p>
    {:else}
      <ul class="space-y-2">
        {#each labels as label (label.id)}
          <li class="rounded-xl border border-lichen bg-fog/60 px-3 py-2.5">
            {#if editingId === label.id}
              <div class="flex items-center gap-2">
                <input
                  bind:value={editName}
                  type="text"
                  maxlength={LABEL_NAME_MAX_LENGTH}
                  aria-label="Label name"
                  class="min-w-0 flex-1 rounded-lg border border-lichen bg-surface px-3 py-1.5 text-sm text-ink outline-none transition focus:border-pine"
                />
                <button
                  type="button"
                  onclick={() => saveEdit(label.id)}
                  disabled={!editName.trim() || busy}
                  class="shrink-0 rounded-lg bg-pine px-3 py-1.5 text-sm font-medium text-surface transition hover:bg-pine-deep disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  type="button"
                  onclick={() => (editingId = null)}
                  class="shrink-0 rounded-lg px-2 py-1.5 text-sm font-medium text-sage transition hover:text-pine-deep"
                >
                  Cancel
                </button>
              </div>
              <div class="mt-3">
                {@render swatches(editColor, (hex) => (editColor = hex))}
              </div>
            {:else}
              <div class="flex items-center justify-between gap-3">
                <LabelChip name={label.name} color={label.color} />
                <div class="flex shrink-0 items-center gap-1">
                  {#if confirmingId === label.id}
                    <span class="text-xs text-sage">Delete?</span>
                    <button
                      type="button"
                      onclick={() => remove(label.id)}
                      disabled={busy}
                      class="rounded-lg px-2 py-1 text-xs font-medium text-bark transition hover:bg-bark/10 disabled:opacity-40"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onclick={() => (confirmingId = null)}
                      class="rounded-lg px-2 py-1 text-xs font-medium text-sage transition hover:text-pine-deep"
                    >
                      No
                    </button>
                  {:else}
                    <button
                      type="button"
                      onclick={() => startEdit(label)}
                      class="rounded-lg px-2 py-1 text-xs font-medium text-sage transition hover:bg-pine/5 hover:text-pine-deep"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onclick={() => {
                        confirmingId = label.id
                        error = null
                      }}
                      class="rounded-lg px-2 py-1 text-xs font-medium text-sage transition hover:bg-bark/10 hover:text-bark"
                    >
                      Delete
                    </button>
                  {/if}
                </div>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Modal>
