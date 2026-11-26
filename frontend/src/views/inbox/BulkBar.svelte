<script lang="ts">
  import {
    BTN_SM_CLASS,
    COMPACT_INPUT_CLASS,
    FIELD_LABEL_CLASS,
    GHOST_BTN_CLASS,
    PRIMARY_BTN_CLASS,
    SECONDARY_BTN_CLASS,
  } from '../../lib/constants'
  import type { TaskCore } from '../../lib/controllers/task-core.svelte'
  import { isPlausibleISODate } from '../../lib/date'
  import DeleteConfirm from '../../lib/components/DeleteConfirm.svelte'
  import LabelMark from '../../lib/components/LabelMark.svelte'
  import { deleteTasksTitle } from '../../lib/format'
  import {
    APPLY,
    CANNOT_UNDO,
    CHOOSE_LABEL,
    CLEAR_ALL,
    COMPLETE,
    deleteCount,
    DONE,
    NO_LABEL,
    SCHEDULE,
    SELECT_ALL,
    selectedCount,
    SET_LABEL,
  } from '../../lib/messages'
  import type { InboxSelect } from './inbox-select.svelte'

  let { select, core }: { select: InboxSelect; core: TaskCore } = $props()

  const uid = $props.id()
  let date = $state('')
  const dateValid = $derived(isPlausibleISODate(date))
  let labelId = $state<number | null | undefined>()

  // Applied only on submit: Chromium fires `change` mid-typing with partial years.
  function schedule(event: SubmitEvent) {
    event.preventDefault()
    if (dateValid) void select.schedule(date)
  }

  // Applied only on submit: Chromium fires `change` on every arrow key while the select is closed.
  function setLabel(event: SubmitEvent) {
    event.preventDefault()
    if (labelId !== undefined) void select.setLabel(labelId)
  }
</script>

<div
  class="sticky top-0 z-sticky rounded-xl border border-lichen bg-fog/95 p-3 shadow-soft backdrop-blur"
>
  <div class="flex items-center justify-between gap-3">
    <span class="text-sm font-medium text-ink">{selectedCount(select.ids.length)}</span>
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={select.toggleAll}
        class="hit-area-y {GHOST_BTN_CLASS} px-2.5 py-1.5 text-xs"
      >
        {select.allSelected ? CLEAR_ALL : SELECT_ALL}
      </button>
      <button
        type="button"
        onclick={select.exit}
        class="hit-area-y {GHOST_BTN_CLASS} px-2.5 py-1.5 text-xs"
      >
        {DONE}
      </button>
    </div>
  </div>

  {#if select.ids.length > 0}
    <div class="mt-3 flex flex-wrap items-end gap-3 border-t border-lichen pt-3">
      {#if core.labels.length > 0}
        <form onsubmit={setLabel}>
          <label for="{uid}-label" class="mb-1 {FIELD_LABEL_CLASS}">{SET_LABEL}</label>
          <div class="flex items-center gap-1.5">
            <select
              id="{uid}-label"
              bind:value={labelId}
              disabled={core.pending}
              class="label-picker w-40 {COMPACT_INPUT_CLASS}"
            >
              <option value={undefined} disabled>{CHOOSE_LABEL}</option>
              <option value={null}>{NO_LABEL}</option>
              {#each core.labels as label (label.id)}
                <option value={label.id}><LabelMark {label} look="option" /></option>
              {/each}
            </select>
            <button
              type="submit"
              disabled={core.pending || labelId === undefined}
              class="{PRIMARY_BTN_CLASS} {BTN_SM_CLASS}"
            >
              {APPLY}
            </button>
          </div>
        </form>
      {/if}
      <form onsubmit={schedule}>
        <label for="{uid}-date" class="mb-1 {FIELD_LABEL_CLASS}">{SCHEDULE}</label>
        <div class="flex items-center gap-1.5">
          <input
            id="{uid}-date"
            bind:value={date}
            type="date"
            disabled={core.pending}
            class={COMPACT_INPUT_CLASS}
          />
          <button
            type="submit"
            disabled={core.pending || !dateValid}
            class="{PRIMARY_BTN_CLASS} {BTN_SM_CLASS}"
          >
            {APPLY}
          </button>
        </div>
      </form>
      <div class="ml-auto flex items-end gap-1.5">
        <button
          type="button"
          onclick={select.complete}
          disabled={core.pending}
          class="{SECONDARY_BTN_CLASS} {BTN_SM_CLASS}"
        >
          {COMPLETE}
        </button>
        <DeleteConfirm
          label={deleteCount(select.ids.length)}
          onConfirm={select.remove}
          title={deleteTasksTitle(select.ids.length)}
          detail={CANNOT_UNDO}
          busy={core.pending}
        />
      </div>
    </div>
  {/if}
</div>
