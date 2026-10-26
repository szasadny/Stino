<script lang="ts">
  import { WEEKDAY_OPTIONS, WORKDAYS } from '../recurrence'

  let {
    weekdays = $bindable(),
    onChange,
  }: {
    weekdays: string[]
    onChange: () => void
  } = $props()

  const isWeekdaysPreset = $derived(
    weekdays.length === WORKDAYS.length && WORKDAYS.every((c) => weekdays.includes(c)),
  )

  function toggleWeekday(code: string) {
    weekdays = weekdays.includes(code) ? weekdays.filter((d) => d !== code) : [...weekdays, code]
    onChange()
  }
  function selectWeekdays() {
    weekdays = [...WORKDAYS]
    onChange()
  }
</script>

<span class="block text-xs font-medium text-sage">On days</span>
<div class="flex flex-wrap items-center gap-1">
  {#each WEEKDAY_OPTIONS as day (day.code)}
    <button
      type="button"
      onclick={() => toggleWeekday(day.code)}
      aria-pressed={weekdays.includes(day.code)}
      class="h-7 w-9 rounded-lg border text-xs font-medium transition {weekdays.includes(day.code)
        ? 'border-pine bg-pine/10 text-pine'
        : 'border-lichen text-sage hover:border-pine/40 hover:text-pine-deep'}"
    >
      {day.label}
    </button>
  {/each}
  <button
    type="button"
    onclick={selectWeekdays}
    aria-pressed={isWeekdaysPreset}
    class="ml-1 h-7 rounded-lg border px-2.5 text-xs font-medium transition {isWeekdaysPreset
      ? 'border-pine bg-pine/10 text-pine'
      : 'border-lichen text-sage hover:border-pine/40 hover:text-pine-deep'}"
  >
    Weekdays
  </button>
</div>
