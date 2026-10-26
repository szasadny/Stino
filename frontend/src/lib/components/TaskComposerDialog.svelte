<script lang="ts">
  import type { Label } from '../types'
  import type { TaskInput } from '../api'
  import type { ComposerDraft } from '../composer'
  import { SHEET_CONTAINER_CLASS, SHEET_PANEL_CLASS } from '../constants'
  import Modal from './Modal.svelte'
  import TaskComposer from './TaskComposer.svelte'

  let {
    open,
    title,
    submitLabel = 'Save',
    labels,
    initial = {},
    busy = false,
    onSubmit,
    onClose,
    onDelete,
    onDeleteOccurrence,
    canDeleteOccurrence = true,
  }: {
    open: boolean
    title: string
    submitLabel?: string
    labels: Label[]
    initial?: Partial<ComposerDraft>
    busy?: boolean
    onSubmit: (input: TaskInput) => void
    onClose: () => void
    onDelete?: () => void
    onDeleteOccurrence?: () => void
    canDeleteOccurrence?: boolean
  } = $props()
</script>

<Modal
  {open}
  {onClose}
  {title}
  panelClass="{SHEET_PANEL_CLASS} sm:w-[min(34rem,calc(100vw-1.5rem))] sm:max-w-[min(34rem,calc(100vw-1.5rem))]"
  containerClass={SHEET_CONTAINER_CLASS}
>
  <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
    {#if open}
      <TaskComposer
        {labels}
        {initial}
        {submitLabel}
        {busy}
        {onSubmit}
        {onDelete}
        {onDeleteOccurrence}
        {canDeleteOccurrence}
        onCancel={onClose}
      />
    {/if}
  </div>
</Modal>
