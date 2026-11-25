<script lang="ts">
  import type { Attachment } from 'svelte/attachments'
  import { getCalendarContext } from '../../lib/controllers/calendar-context'
  import { createComposer } from '../../lib/controllers/composer.svelte'
  import { formatDayFull, toISODate } from '../../lib/date'
  import { dragEdgeScroll } from '../../lib/dnd/drag-scroll.action'
  import { dayTaskCount } from '../../lib/format'
  import AddTaskButton from '../../lib/components/AddTaskButton.svelte'
  import ComposerForm from '../../lib/components/composer/ComposerForm.svelte'
  import DayAgenda from '../../lib/components/DayAgenda.svelte'
  import ErrorAlert from '../../lib/components/ErrorAlert.svelte'
  import Modal from '../../lib/components/Modal.svelte'

  const { core, selection } = getCalendarContext()
  const composer = createComposer(core)
  const date = $derived(selection.selectedDate)
  const tasks = $derived(selection.selectedTasks)
  if (selection.selectedDate) core.clearError()

  const subtitle = $derived(composer.open ? composer.title : dayTaskCount(tasks.length))

  // The form's buttons leave the DOM with it, which would drop focus out of the sheet.
  let body = $state<HTMLDivElement | null>(null)
  const refocusOnLeave: Attachment = () => () => body?.focus()
</script>

<Modal
  open={date != null}
  onClose={selection.clear}
  title={date ? formatDayFull(date) : ''}
  {subtitle}
  size="sheet"
>
  <div
    bind:this={body}
    tabindex="-1"
    class="flex-1 overflow-y-auto px-4 py-4 outline-none sm:px-5"
    use:dragEdgeScroll
  >
    <ErrorAlert error={core.error} class="mb-3" />

    {#if composer.open}
      <div {@attach refocusOnLeave}>
        <ComposerForm {composer} />
      </div>
    {:else if date}
      {@const day = toISODate(date)}
      <DayAgenda {core} {tasks} onEdit={composer.edit} />
      <AddTaskButton onclick={() => composer.create({ date: day })} class="mt-4 py-2.5" />
    {/if}
  </div>
</Modal>
