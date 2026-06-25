<script lang="ts">
  // The day-zoom sheet: tap a calendar cell to see that day's tasks in full,
  // grouped by label (via DayAgenda), with the same complete-toggle as the
  // lists. Read + complete only — editing and scheduling stay in the Inbox. The
  // dialog shell lives in Modal; this is a bottom sheet on a phone, a centered
  // card on wider screens. Driven by the `date` prop (null = closed).
  import type { Label, Task } from '../types'
  import { formatDayFull } from '../date'
  import DayAgenda from './DayAgenda.svelte'
  import Modal from './Modal.svelte'

  let {
    date,
    tasks,
    labels,
    onToggle,
    onClose,
  }: {
    date: Date | null
    tasks: Task[]
    labels: Label[]
    onToggle: (task: Task) => void
    onClose: () => void
  } = $props()

  const subtitle = $derived(
    tasks.length === 0
      ? 'Nothing scheduled'
      : `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`,
  )
</script>

<Modal
  open={date != null}
  {onClose}
  title={date ? formatDayFull(date) : ''}
  {subtitle}
  panelClass="mx-auto mb-0 mt-auto max-h-[80vh] w-full rounded-t-2xl sm:my-auto sm:w-[min(32rem,calc(100vw-1.5rem))] sm:rounded-2xl"
  containerClass="max-h-[80vh]"
>
  <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
    <DayAgenda {tasks} {labels} {onToggle} />
  </div>
</Modal>
