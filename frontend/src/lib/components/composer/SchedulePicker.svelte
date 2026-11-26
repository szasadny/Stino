<script lang="ts">
  import {
    CHIP_OFF_CLASS,
    CLEAR_BTN_CLASS,
    COMPACT_INPUT_CLASS,
    FIELD_LABEL_CLASS,
  } from '../../constants'
  import { quickDates } from '../../date'
  import {
    CLEAR,
    DUE_DATE,
    DUE_TIME,
    NEXT_WEEK,
    NO_DATE_STAYS_IN_INBOX,
    PICK_A_DATE_FIRST,
    SAME_DAY_NEXT_WEEK,
    SCHEDULE,
    TODAY,
    TOMORROW,
  } from '../../messages'
  import { todayDate } from '../../today.svelte'

  let {
    date = $bindable(),
    time = $bindable(),
    onCommit,
  }: { date: string; time: string; onCommit: () => void } = $props()

  const chips = $derived.by(() => {
    const quick = quickDates(todayDate())
    return [
      { label: TODAY, iso: quick.today, title: undefined },
      { label: TOMORROW, iso: quick.tomorrow, title: undefined },
      { label: NEXT_WEEK, iso: quick.nextWeek, title: SAME_DAY_NEXT_WEEK },
    ]
  })

  function setDate(value: string) {
    date = value
    syncTime()
    onCommit()
  }

  function syncTime() {
    if (!date) time = ''
  }
</script>

<div class="space-y-1.5">
  <span class={FIELD_LABEL_CLASS}>{SCHEDULE}</span>
  <div class="flex flex-wrap items-center gap-1.5">
    <input
      bind:value={date}
      onchange={syncTime}
      onblur={onCommit}
      type="date"
      aria-label={DUE_DATE}
      class={COMPACT_INPUT_CLASS}
    />
    <input
      bind:value={time}
      type="time"
      disabled={!date}
      aria-label={DUE_TIME}
      title={date ? '' : PICK_A_DATE_FIRST}
      class={COMPACT_INPUT_CLASS}
    />
    <!-- One block, so the chips wrap together under the fields. -->
    <div class="flex basis-full flex-wrap items-center gap-1.5">
      {#each chips as chip (chip.label)}
        <button
          type="button"
          onclick={() => setDate(chip.iso)}
          title={chip.title}
          class="h-9 rounded-lg border px-2.5 text-xs font-medium transition {CHIP_OFF_CLASS}"
        >
          {chip.label}
        </button>
      {/each}
      {#if date}
        <button type="button" onclick={() => setDate('')} class="{CLEAR_BTN_CLASS} py-1.5">
          {CLEAR}
        </button>
      {/if}
    </div>
  </div>
  {#if !date}
    <p class="text-xs text-sage">{NO_DATE_STAYS_IN_INBOX}</p>
  {/if}
</div>
