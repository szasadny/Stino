<script lang="ts">
  import {
    CHIP_OFF_CLASS,
    CLEAR_BTN_CLASS,
    COMPACT_INPUT_CLASS,
    FIELD_LABEL_CLASS,
  } from '../../constants'
  import { quickDates } from '../../date'
  import { todayDate } from '../../today.svelte'

  let { date = $bindable(), time = $bindable() }: { date: string; time: string } = $props()

  const chips = $derived.by(() => {
    const quick = quickDates(todayDate())
    return [
      { label: 'Today', iso: quick.today, title: undefined },
      { label: 'Tomorrow', iso: quick.tomorrow, title: undefined },
      { label: 'Next week', iso: quick.nextWeek, title: 'Same day next week' },
    ]
  })

  function setDate(value: string) {
    date = value
    syncTime()
  }

  function syncTime() {
    if (!date) time = ''
  }
</script>

<div class="space-y-1.5">
  <span class={FIELD_LABEL_CLASS}>Schedule</span>
  <div class="flex flex-wrap items-center gap-1.5">
    <input
      bind:value={date}
      onchange={syncTime}
      type="date"
      aria-label="Due date"
      class={COMPACT_INPUT_CLASS}
    />
    <input
      bind:value={time}
      type="time"
      disabled={!date}
      aria-label="Due time"
      title={date ? '' : 'Pick a date first'}
      class={COMPACT_INPUT_CLASS}
    />
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
        Clear
      </button>
    {/if}
  </div>
  {#if !date}
    <p class="text-xs text-sage">No date, so it stays in the Inbox.</p>
  {/if}
</div>
