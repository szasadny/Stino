<script lang="ts">
  import { api } from '../../lib/api'
  import { formatDayFull } from '../../lib/date'
  import { pluralize } from '../../lib/format'
  import { BTN_SM_CLASS, PRIMARY_BTN_CLASS } from '../../lib/constants'
  import { LOAD_TODAY_FAILED } from '../../lib/messages'
  import { todayDate, todayKey } from '../../lib/today.svelte'
  import { createTaskCore } from '../../lib/controllers/task-core.svelte'
  import { createComposer } from '../../lib/controllers/composer.svelte'
  import ComposerDialog from '../../lib/components/composer/ComposerDialog.svelte'
  import DayAgenda from '../../lib/components/DayAgenda.svelte'
  import ListViewShell from '../../lib/components/ListViewShell.svelte'
  import Plus from '../../lib/components/icons/Plus.svelte'

  const core = createTaskCore()
  core.bindLoad(() => api.tasks.forDate(todayKey()), LOAD_TODAY_FAILED)
  const composer = createComposer(core)

  const count = $derived(core.tasks.filter((t) => !t.completed).length)
  const unknown = $derived(core.loading || (core.error != null && core.tasks.length === 0))
  const subtitle = $derived(unknown ? '' : `${pluralize(count, 'task')} due today`)
</script>

<ListViewShell
  title={formatDayFull(todayDate())}
  {subtitle}
  error={core.error}
  loading={core.loading}
  empty={core.tasks.length === 0}
  emptyMessage="Nothing due today."
>
  {#snippet actions()}
    <button
      type="button"
      onclick={() => composer.create({ date: todayKey() })}
      class="{PRIMARY_BTN_CLASS} {BTN_SM_CLASS} flex shrink-0 items-center gap-1.5"
    >
      <Plus class="h-4 w-4" />
      Add task
    </button>
  {/snippet}

  <DayAgenda {core} tasks={core.tasks} onEdit={composer.edit} />
</ListViewShell>

<ComposerDialog {composer} />
