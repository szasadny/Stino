<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { Attachment } from 'svelte/attachments'
  import DeleteConfirm from '../../lib/components/DeleteConfirm.svelte'
  import LabelChip from '../../lib/components/LabelChip.svelte'
  import { GHOST_BTN_CLASS } from '../../lib/constants'
  import type { Label, LabelInput } from '../../lib/types'
  import type { LabelStore } from './label-store.svelte'
  import LabelForm from './LabelForm.svelte'

  let {
    label,
    store,
    handle,
    editing,
    returnFocus,
    onEdit,
    onDone,
  }: {
    label: Label
    store: LabelStore
    handle: Snippet | null
    editing: boolean
    returnFocus: boolean
    onEdit: () => void
    onDone: () => void
  } = $props()

  // Only ending this row's own rename hands focus back; opening another row must not steal it.
  const refocus: Attachment<HTMLButtonElement> = (button) => {
    if (returnFocus) button.focus()
  }

  async function save(input: LabelInput): Promise<boolean> {
    const saved = await store.update(label.id, input)
    if (saved) onDone()
    return saved
  }
</script>

<li class="rounded-xl border border-lichen bg-fog/60 px-3 py-2.5">
  {#if editing}
    <LabelForm {label} busy={store.pending} onSubmit={save} onCancel={onDone} />
  {:else}
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        {@render handle?.()}
        <LabelChip {label} />
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <button
          {@attach refocus}
          type="button"
          onclick={onEdit}
          class="{GHOST_BTN_CLASS} px-2 py-1 text-xs"
        >
          Edit
        </button>
        <DeleteConfirm onConfirm={() => store.remove(label.id)} busy={store.pending} compact />
      </div>
    </div>
  {/if}
</li>
