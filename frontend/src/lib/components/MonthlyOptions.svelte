<script lang="ts">
  import {
    MONTH_WEEKDAY_OPTIONS,
    ORDINAL_OPTIONS,
    WORKDAY_CODE,
    type MonthlyMode,
    type OrdinalPosition,
  } from '../recurrence'

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
    monthWeekday: string
    onChange: () => void
  } = $props()

  const MONTHDAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1)

  const MODES: { id: MonthlyMode; label: string }[] = [
    { id: 'monthday', label: 'On a date' },
    { id: 'weekday', label: 'On a weekday' },
  ]

  const SELECT_CLASS =
    'rounded-lg border border-lichen bg-surface px-2 py-1.5 text-sm text-ink outline-none transition focus:border-pine'

  function setMode(next: MonthlyMode) {
    monthlyMode = next
    onChange()
  }
</script>

<div class="flex gap-1">
  {#each MODES as mode (mode.id)}
    <button
      type="button"
      onclick={() => setMode(mode.id)}
      aria-pressed={monthlyMode === mode.id}
      class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition {monthlyMode === mode.id
        ? 'border-pine bg-pine/10 text-pine'
        : 'border-lichen text-sage hover:border-pine/40 hover:text-pine-deep'}"
    >
      {mode.label}
    </button>
  {/each}
</div>

{#if monthlyMode === 'monthday'}
  <div class="flex flex-wrap items-center gap-2">
    <span class="text-xs text-sage">Repeat on the</span>
    <select
      bind:value={monthday}
      onchange={onChange}
      aria-label="Day of the month"
      class={SELECT_CLASS}
    >
      {#each MONTHDAY_OPTIONS as day (day)}
        <option value={day}>{day}</option>
      {/each}
      <option value={-1}>Last day</option>
    </select>
  </div>
  {#if monthday > 28}
    <p class="text-xs text-sage">Months without this day are skipped.</p>
  {/if}
{:else}
  <div class="flex flex-wrap items-center gap-2">
    <span class="text-xs text-sage">Repeat on the</span>
    <select bind:value={position} onchange={onChange} aria-label="Which week" class={SELECT_CLASS}>
      {#each ORDINAL_OPTIONS as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
    <select bind:value={monthWeekday} onchange={onChange} aria-label="Weekday" class={SELECT_CLASS}>
      {#each MONTH_WEEKDAY_OPTIONS as day (day.code)}
        <option value={day.code}>{day.label}</option>
      {/each}
    </select>
  </div>
  {#if position === 5 && monthWeekday !== WORKDAY_CODE}
    <p class="text-xs text-sage">Months without a fifth one are skipped.</p>
  {/if}
{/if}
