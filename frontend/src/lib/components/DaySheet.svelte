<script lang="ts">
  // Inline editing avoids stacking a modal over the phone day sheet.
  import type { Label, Task } from '../types'
  import type { TaskInput } from '../api'
  import { taskToDraft } from '../composer'
  import { formatDayFull, toISODate } from '../date'
  import { dragEdgeScroll } from '../drag-scroll'
  import { errorMessage } from '../errors'
  import DayAgenda from './DayAgenda.svelte'
  import ErrorAlert from './ErrorAlert.svelte'
  import Modal from './Modal.svelte'
  import TaskComposer from './TaskComposer.svelte'

  let {
    date,
    tasks,
    labels,
    pending = false,
    onToggle,
    onReorder,
    onReorderLabels,
    onCreate,
    onUpdate,
    onDelete,
    onClose,
  }: {
    date: Date | null
    tasks: Task[]
    labels: Label[]
    pending?: boolean
    onToggle: (task: Task) => void
    onReorder?: (ids: number[]) => void
    onReorderLabels?: (ids: number[]) => void
    onCreate?: (input: TaskInput) => Promise<void>
    onUpdate?: (id: number, input: TaskInput) => Promise<void>
    onDelete?: (id: number) => Promise<void>
    onClose: () => void
  } = $props()

  type Composing = { mode: 'add' } | { mode: 'edit'; task: Task }
  let composing = $state<Composing | null>(null)
  let busy = $state(false)
  let error = $state<string | null>(null)

  $effect(() => {
    date
    composing = null
    error = null
  })

  const subtitle = $derived(
    composing
      ? composing.mode === 'add'
        ? 'New task'
        : 'Edit task'
      : tasks.length === 0
        ? 'Nothing scheduled'
        : `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`,
  )

  async function submit(input: TaskInput) {
    if (!composing || busy) return
    busy = true
    error = null
    try {
      if (composing.mode === 'add') await onCreate?.(input)
      else await onUpdate?.(composing.task.id, input)
      composing = null
    } catch (err) {
      error = errorMessage(err, 'Could not save the task')
    } finally {
      busy = false
    }
  }

  async function remove() {
    if (!composing || composing.mode !== 'edit' || busy) return
    busy = true
    error = null
    try {
      await onDelete?.(composing.task.id)
      composing = null
    } catch (err) {
      error = errorMessage(err, 'Could not delete the task')
    } finally {
      busy = false
    }
  }
</script>

<Modal
  open={date != null}
  {onClose}
  title={date ? formatDayFull(date) : ''}
  {subtitle}
  panelClass="m-2 h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none rounded-2xl sm:m-auto sm:h-auto sm:max-h-[85vh] sm:w-[min(32rem,calc(100vw-1.5rem))] sm:max-w-[min(32rem,calc(100vw-1.5rem))] sm:rounded-2xl"
  containerClass="h-full sm:h-auto sm:max-h-[85vh]"
>
  <!-- dragEdgeScroll: a long day still reorders by touch — holding a task near the
       sheet's top/bottom edge auto-scrolls the list to reach off-screen rows. -->
  <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-5" use:dragEdgeScroll>
    <ErrorAlert {error} class="mb-3" />

    {#if composing && date}
      <!-- Key the editor on the editing identity so an edit→edit (or add→edit) transition
           re-seeds the draft and resets its delete-confirm, even without remounting. -->
      {#key composing.mode === 'edit' ? composing.task.id : 'add'}
        <TaskComposer
          {labels}
          {busy}
          initial={composing.mode === 'edit'
            ? taskToDraft(composing.task)
            : { date: toISODate(date) }}
          submitLabel={composing.mode === 'edit' ? 'Save' : 'Add'}
          onSubmit={submit}
          onDelete={composing.mode === 'edit' && onDelete ? remove : undefined}
          onCancel={() => (composing = null)}
        />
      {/key}
    {:else}
      <DayAgenda
        {tasks}
        {labels}
        {pending}
        {onToggle}
        {onReorder}
        {onReorderLabels}
        onEdit={onUpdate ? (task) => (composing = { mode: 'edit', task }) : undefined}
      />

      {#if onCreate}
        <button
          type="button"
          onclick={() => (composing = { mode: 'add' })}
          class="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-lichen px-3 py-2.5 text-sm font-medium text-sage transition hover:border-pine/40 hover:bg-pine/[0.04] hover:text-pine-deep"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add a task
        </button>
      {/if}
    {/if}
  </div>
</Modal>
