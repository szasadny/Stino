<script lang="ts">
  import { COMPACT_INPUT_CLASS } from '../../constants'
  import { DAY_OF_MONTH, LAST_DAY, REPEAT_ON_THE, WEEKDAY, WHICH_WEEK } from '../../messages'
  import { monthlySkipNote } from '../../recurrence/describe'
  import type { MonthWeekday, MonthlyMode, OrdinalPosition } from '../../recurrence/model'
  import {
    MONTHDAY_OPTIONS,
    MONTHLY_MODE_OPTIONS,
    MONTH_WEEKDAY_OPTIONS,
    ORDINAL_OPTIONS,
  } from '../../recurrence/options'
  import ToggleChip from './ToggleChip.svelte'

  let {
    monthlyMode = $bindable(),
    monthday = $bindable(),
    position = $bindable(),
    monthWeekday = $bindable(),
    onChange,
  }: {
    monthlyMode: MonthlyMode
    monthday: number
    position: OrdinalPosition
    monthWeekday: MonthWeekday
    onChange: () => void
  } = $props()

  const note = $derived(monthlySkipNote({ monthlyMode, monthday, position, monthWeekday }))

  function setMode(next: MonthlyMode) {
    monthlyMode = next
    onChange()
  }
</script>

<div class="flex gap-1">
  {#each MONTHLY_MODE_OPTIONS as mode (mode.value)}
    <ToggleChip pressed={monthlyMode === mode.value} onclick={() => setMode(mode.value)}>
      {mode.label}
    </ToggleChip>
  {/each}
</div>

<div class="flex flex-wrap items-center gap-2">
  <span class="text-xs text-sage">{REPEAT_ON_THE}</span>
  {#if monthlyMode === 'monthday'}
    <select
      bind:value={monthday}
      onchange={onChange}
      aria-label={DAY_OF_MONTH}
      class={COMPACT_INPUT_CLASS}
    >
      {#each MONTHDAY_OPTIONS as day (day)}
        <option value={day}>{day}</option>
      {/each}
      <option value={-1}>{LAST_DAY}</option>
    </select>
  {:else}
    <div class="flex items-center gap-2">
      <select
        bind:value={position}
        onchange={onChange}
        aria-label={WHICH_WEEK}
        class={COMPACT_INPUT_CLASS}
      >
        {#each ORDINAL_OPTIONS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
      <select
        bind:value={monthWeekday}
        onchange={onChange}
        aria-label={WEEKDAY}
        class={COMPACT_INPUT_CLASS}
      >
        {#each MONTH_WEEKDAY_OPTIONS as day (day.code)}
          <option value={day.code}>{day.label}</option>
        {/each}
      </select>
    </div>
  {/if}
</div>
{#if note}
  <p class="text-xs text-sage">{note}</p>
{/if}
