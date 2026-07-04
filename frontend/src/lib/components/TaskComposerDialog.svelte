<script lang="ts">
  // The task editor in a modal. Used wherever the editor opens outside an existing dialog:
  // Inbox, Today, and a task tapped on the month/week grid. (The day sheet embeds the bare
  // TaskComposer inline instead, to avoid stacking dialogs.)
  import type { Label } from '../types'
  import type { TaskInput } from '../api'
  import type { ComposerDraft } from '../composer'
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
  }: {
    open: boolean
    title: string
    submitLabel?: string
    labels: Label[]
    initial?: Partial<ComposerDraft>
    busy?: boolean
    onSubmit: (input: TaskInput) => void
    onClose: () => void
    // Present only when editing — surfaces a Delete button in the composer footer.
    onDelete?: () => void
  } = $props()
</script>

<Modal
  {open}
  {onClose}
  {title}
  panelClass="m-2 h-[calc(100svh-1rem)] max-h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] max-w-none rounded-2xl sm:m-auto sm:h-auto sm:max-h-[85vh] sm:w-[min(34rem,calc(100vw-1.5rem))] sm:max-w-[min(34rem,calc(100vw-1.5rem))] sm:rounded-2xl"
  containerClass="h-full sm:h-auto sm:max-h-[85vh]"
>
  <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
    {#if open}
      <!-- Mount fresh each open so the draft seeds from the latest `initial`. -->
      <TaskComposer
        {labels}
        {initial}
        {submitLabel}
        {busy}
        {onSubmit}
        {onDelete}
        onCancel={onClose}
      />
    {/if}
  </div>
</Modal>
