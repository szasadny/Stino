<script lang="ts">
  // Manage labels: create, rename, recolor, delete. The dialog shell (header,
  // close, backdrop, open/close) lives in Modal; this owns the list and the
  // create/edit forms. Loads its list and focuses the name field each time it
  // opens (via Modal's onOpen).
  import { dndzone, dragHandleZone, dragHandle, type DndEvent } from 'svelte-dnd-action'
  import { api, type LabelInput } from '../api'
  import {
    DND_FLIP_MS,
    DND_TOUCH_HOLD_MS,
    INPUT_CLASS,
    LABEL_EMOJI_MAX_LENGTH,
    LABEL_EMOJI_SUGGESTIONS,
    LABEL_NAME_MAX_LENGTH,
    LABEL_PALETTE,
    PRIMARY_BTN_CLASS,
  } from '../constants'
  import { errorMessage } from '../errors'
  import { isCompact } from '../viewport.svelte'
  import type { Label } from '../types'
  import DeleteConfirm from './DeleteConfirm.svelte'
  import ErrorAlert from './ErrorAlert.svelte'
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
  let newEmoji = $state('')

  // Inline edit state (one row at a time). The delete-confirm is owned by each
  // row's DeleteConfirm component, so no per-row confirm state lives here.
  let editingId = $state<number | null>(null)
  let editName = $state('')
  let editColor = $state('')
  let editEmoji = $state('')

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
      const created = await api.labels.create({
        name,
        color: newColor,
        emoji: newEmoji.trim() || null,
      })
      labels = [...labels, created]
      newName = ''
      newColor = LABEL_PALETTE[0].hex
      newEmoji = ''
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
    editEmoji = label.emoji ?? ''
    error = null
  }

  async function saveEdit(id: number) {
    const name = editName.trim()
    if (!name || busy) return
    busy = true
    error = null
    try {
      const patch: Partial<LabelInput> = {
        name,
        color: editColor,
        emoji: editEmoji.trim() || null,
      }
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
    } catch (e) {
      error = errorMessage(e, 'Could not delete label')
    } finally {
      busy = false
    }
  }

  // Drag-to-reorder the label list — this order IS the global label `sort_order`, the
  // default that drives the grouped day view's section order. The `labels` list is the
  // owned dnd source (mutated only by consider/finalize during a gesture), so no separate
  // re-projection is needed. Reordering only makes sense with more than one label, and is
  // locked while editing a row or a request is in flight. `#tag` in quick-add and the
  // suggestion menu read the same order. The gesture differs by input, like every list:
  // wide grabs the 6-dot grip (`dragHandleZone`); a phone press-and-holds the whole row
  // (`dndzone` + `delayTouchStart`) — `isCompact()` mounts exactly ONE of the two zones.
  const compact = $derived(isCompact())
  const reorderable = $derived(labels.length > 1 && editingId === null && !busy)
  let preDrag: Label[] = []

  function considerOrder(e: CustomEvent<DndEvent<Label>>) {
    if (preDrag.length === 0) preDrag = [...labels]
    labels = e.detail.items
  }

  async function finalizeOrder(e: CustomEvent<DndEvent<Label>>) {
    const before = preDrag
    preDrag = []
    labels = e.detail.items
    const ids = labels.map((l) => l.id)
    // A drop in the same spot needs no write.
    if (ids.join() === before.map((l) => l.id).join()) return
    busy = true
    error = null
    try {
      await api.labels.reorder(ids)
    } catch (err) {
      labels = before // revert to the pre-drag order
      error = errorMessage(err, 'Could not save the label order')
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

{#snippet emojiField(value: string, onset: (emoji: string) => void)}
  <div>
    <span class="block text-xs font-medium text-sage"
      >Emoji <span class="font-normal">(optional)</span></span
    >
    <div class="mt-1.5 flex items-start gap-2">
      <input
        type="text"
        {value}
        oninput={(e) => onset(e.currentTarget.value)}
        maxlength={LABEL_EMOJI_MAX_LENGTH}
        placeholder="🙂"
        aria-label="Label emoji"
        class="h-9 w-12 shrink-0 rounded-lg border border-lichen bg-fog text-center text-lg outline-none transition focus:border-pine focus:bg-surface"
      />
      <div class="grid flex-1 grid-cols-6 gap-1" role="group" aria-label="Emoji suggestions">
        {#each LABEL_EMOJI_SUGGESTIONS as suggestion (suggestion)}
          <button
            type="button"
            onclick={() => onset(suggestion)}
            aria-label={suggestion}
            aria-pressed={value === suggestion}
            class="grid h-9 place-items-center rounded-lg text-lg transition {value === suggestion
              ? 'bg-pine/10 ring-1 ring-pine'
              : 'hover:bg-pine/5'}"
          >
            {suggestion}
          </button>
        {/each}
      </div>
      {#if value}
        <button
          type="button"
          onclick={() => onset('')}
          class="h-9 shrink-0 self-start rounded-lg px-2 text-xs font-medium text-sage transition hover:text-pine-deep"
        >
          Clear
        </button>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet grip()}
  <div
    use:dragHandle
    title="Drag to reorder"
    aria-label="Drag to reorder"
    class="grid h-6 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-sage transition hover:text-pine-deep active:cursor-grabbing"
  >
    <svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4" aria-hidden="true">
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
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
  <ErrorAlert {error} class="mx-5 mt-4" />

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
        class="min-w-0 flex-1 {INPUT_CLASS}"
      />
      <button
        type="submit"
        disabled={!newName.trim() || busy}
        class="{PRIMARY_BTN_CLASS} shrink-0 px-4 py-2"
      >
        Add
      </button>
    </div>
    <div class="mt-3">
      {@render swatches(newColor, (hex) => (newColor = hex))}
    </div>
    <div class="mt-3">
      {@render emojiField(newEmoji, (emoji) => (newEmoji = emoji))}
    </div>
  </form>

  <!-- Existing labels -->
  <div class="flex-1 overflow-y-auto px-5 py-4">
    {#if loading}
      <p class="py-6 text-center text-sm text-sage">Loading…</p>
    {:else if labels.length === 0}
      <p class="py-6 text-center text-sm text-sage">No labels yet — create your first above.</p>
    {:else}
      {#snippet labelRow(label: Label)}
        {#if editingId === label.id}
          <div class="flex items-center gap-2">
            <input
              bind:value={editName}
              type="text"
              maxlength={LABEL_NAME_MAX_LENGTH}
              aria-label="Label name"
              class="min-w-0 flex-1 rounded-lg border border-lichen bg-surface px-3 py-1.5 text-sm text-ink outline-none transition focus:border-pine focus:ring-2 focus:ring-pine/20"
            />
            <button
              type="button"
              onclick={() => saveEdit(label.id)}
              disabled={!editName.trim() || busy}
              class="{PRIMARY_BTN_CLASS} shrink-0 px-3 py-1.5"
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
          <div class="mt-3">
            {@render emojiField(editEmoji, (emoji) => (editEmoji = emoji))}
          </div>
        {:else}
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
              {#if reorderable && !compact}
                {@render grip()}
              {/if}
              <LabelChip name={label.name} color={label.color} emoji={label.emoji} />
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onclick={() => startEdit(label)}
                class="rounded-lg px-2 py-1 text-xs font-medium text-sage transition hover:bg-pine/5 hover:text-pine-deep"
              >
                Edit
              </button>
              <DeleteConfirm onConfirm={() => remove(label.id)} {busy} compact />
            </div>
          </div>
        {/if}
      {/snippet}
      {#if compact}
        <!-- Phone: press-and-hold anywhere on a row (its buttons excepted) to drag. -->
        <ul
          class="space-y-2"
          use:dndzone={{
            items: labels,
            flipDurationMs: DND_FLIP_MS,
            dropTargetStyle: {},
            dragDisabled: !reorderable,
            delayTouchStart: DND_TOUCH_HOLD_MS,
            zoneItemTabIndex: -1,
          }}
          onconsider={considerOrder}
          onfinalize={finalizeOrder}
        >
          {#each labels as label (label.id)}
            <li class="rounded-xl border border-lichen bg-fog/60 px-3 py-2.5">
              {@render labelRow(label)}
            </li>
          {/each}
        </ul>
      {:else}
        <ul
          class="space-y-2"
          use:dragHandleZone={{
            items: labels,
            flipDurationMs: DND_FLIP_MS,
            dropTargetStyle: {},
            dragDisabled: !reorderable,
          }}
          onconsider={considerOrder}
          onfinalize={finalizeOrder}
        >
          {#each labels as label (label.id)}
            <li class="rounded-xl border border-lichen bg-fog/60 px-3 py-2.5">
              {@render labelRow(label)}
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</Modal>
