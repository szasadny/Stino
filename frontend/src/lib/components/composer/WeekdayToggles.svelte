<script lang="ts">
  import { FIELD_LABEL_CLASS } from '../../constants'
  import { ON_DAYS, WEEKDAYS_PRESET } from '../../messages'
  import { WORKDAYS, isWorkdaySet, orderWeekdays, type WeekdayCode } from '../../recurrence/model'
  import { WEEKDAY_OPTIONS } from '../../recurrence/options'
  import ToggleChip from './ToggleChip.svelte'

  let {
    weekdays = $bindable(),
    onChange,
  }: {
    weekdays: WeekdayCode[]
    onChange: () => void
  } = $props()

  const isWeekdaysPreset = $derived(isWorkdaySet(orderWeekdays(weekdays)))

  function toggleWeekday(code: WeekdayCode) {
    weekdays = weekdays.includes(code) ? weekdays.filter((d) => d !== code) : [...weekdays, code]
    onChange()
  }
  function selectWeekdays() {
    weekdays = [...WORKDAYS]
    onChange()
  }
</script>

<span class={FIELD_LABEL_CLASS}>{ON_DAYS}</span>
<div class="flex flex-wrap items-center gap-x-1 gap-y-2">
  {#each WEEKDAY_OPTIONS as day (day.code)}
    <ToggleChip
      pressed={weekdays.includes(day.code)}
      onclick={() => toggleWeekday(day.code)}
      class="hit-area-y h-7 w-9 rounded-lg"
    >
      {day.label}
    </ToggleChip>
  {/each}
  <ToggleChip
    pressed={isWeekdaysPreset}
    onclick={selectWeekdays}
    class="hit-area-y h-7 rounded-lg px-2.5"
  >
    {WEEKDAYS_PRESET}
  </ToggleChip>
</div>
