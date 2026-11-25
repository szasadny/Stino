<script lang="ts">
  import {
    FIELD_LABEL_CLASS,
    GHOST_BTN_CLASS,
    INPUT_CLASS,
    PRIMARY_BTN_CLASS,
  } from '../../lib/constants'
  import type { TaskCore } from '../../lib/controllers/task-core.svelte'
  import { isPlausibleISODate } from '../../lib/date'
  import DeleteConfirm from '../../lib/components/DeleteConfirm.svelte'
  import LabelSelect from './LabelSelect.svelte'
  import type { InboxSelect } from './inbox-select.svelte'

  let { select, core }: { select: InboxSelect; core: TaskCore } = $props()

  const uid = $props.id()
  let date = $state('')
  const dateValid = $derived(isPlausibleISODate(date))

  // Applied only on submit: Chromium fires `change` mid-typing with partial years.
  function schedule(event: SubmitEvent) {
    event.preventDefault()
    if (dateValid) void select.schedule(date)
  }
</script>

<div
  class="sticky top-0 z-sticky rounded-xl border border-lichen bg-fog/95 p-3 shadow-soft backdrop-blur"
>
  <div class="flex items-center justify-between gap-3">
    <span class="text-sm font-medium text-ink">{select.ids.length} selected</span>
    <div class="flex items-center gap-1">
      <button type="button" onclick={select.toggleAll} class="{GHOST_BTN_CLASS} px-2.5 py-1.5">
        {select.allSelected ? 'Clear all' : 'Select all'}
      </button>
      <button
        type="button"
        onclick={select.exit}
        class="rounded-lg px-2.5 py-1.5 text-xs font-medium text-sage transition hover:text-pine-deep"
      >
        Done
      </button>
    </div>
  </div>

  {#if select.ids.length > 0}
    <div class="mt-3 flex flex-wrap items-end gap-3 border-t border-lichen pt-3">
      {#if core.labels.length > 0}
        <div class="min-w-[10rem]">
          <label for="{uid}-label" class="mb-1 {FIELD_LABEL_CLASS}">Set label</label>
          <LabelSelect
            id="{uid}-label"
            labels={core.labels}
            value={null}
            onChange={select.setLabel}
          />
        </div>
      {/if}
      <form onsubmit={schedule}>
        <label for="{uid}-date" class="mb-1 {FIELD_LABEL_CLASS}">Schedule</label>
        <div class="flex items-center gap-1.5">
          <input
            id="{uid}-date"
            bind:value={date}
            type="date"
            disabled={core.pending}
            class="{INPUT_CLASS} disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={core.pending || !dateValid}
            class="{PRIMARY_BTN_CLASS} px-3 py-2"
          >
            Apply
          </button>
        </div>
      </form>
      <div class="ml-auto flex items-end gap-1.5">
        <button
          type="button"
          onclick={select.complete}
          disabled={core.pending}
          class="rounded-lg border border-lichen px-3 py-1.5 text-sm font-medium text-pine transition hover:bg-pine/5 disabled:opacity-40"
        >
          Complete
        </button>
        <DeleteConfirm
          label="Delete {select.ids.length}"
          onConfirm={select.remove}
          busy={core.pending}
        />
      </div>
    </div>
  {/if}
</div>
