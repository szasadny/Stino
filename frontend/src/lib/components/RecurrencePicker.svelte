<script lang="ts">
  // A calm recurrence control for the task edit panel: pick how a task repeats —
  // Does not repeat / Daily / Weekly (toggle weekdays) / Monthly (on a date or
  // the Nth weekday) / Custom (every N days|weeks). Emits the RRULE string (or
  // null) via onChange; the option⇄RRULE mapping lives in lib/recurrence.ts. A
  // stored rule we don't model is shown read-only and kept intact unless cleared.
  import { untrack } from 'svelte'
  import {
    buildRRule,
    monthlyDefaultsFor,
    ORDINAL_OPTIONS,
    parseRRule,
    summarize,
    WEEKDAY_LONG,
    WEEKDAY_OPTIONS,
    type MonthlyMode,
    type OrdinalPosition,
    type RecurrenceFreq,
    type RecurrenceValue,
  } from '../recurrence'

  let {
    value,
    startDate = null,
    onChange,
  }: {
    value: string | null
    startDate?: string | null
    onChange: (rule: string | null) => void
  } = $props()

  // The picker seeds itself from `value` once and is then uncontrolled — it owns
  // the richer structured state and emits an RRULE via onChange. (It remounts per
  // edit session, so it never needs to react to `value` changing under it;
  // untrack makes that snapshot intent explicit.)
  const parsed = untrack(() => parseRRule(value))
  // A non-empty rule that didn't map to a known mode — preserve it rather than
  // silently rewriting it. Cleared explicitly by the user.
  let unknownRule = $state(
    untrack(() => (value && parseRRule(value).freq === 'none' ? value : null)),
  )

  let freq = $state<RecurrenceFreq>(parsed.freq)
  let interval = $state(parsed.interval)
  let unit = $state<'day' | 'week'>(parsed.unit)
  let weekdays = $state<string[]>(parsed.weekdays)
  let monthlyMode = $state<MonthlyMode>(parsed.monthlyMode)
  let monthday = $state<number>(parsed.monthday)
  let position = $state<OrdinalPosition>(parsed.position)
  let monthWeekday = $state<string>(parsed.monthWeekday)
  let until = $state<string | null>(parsed.until)

  const current = $derived<RecurrenceValue>({
    freq,
    interval,
    unit,
    weekdays,
    monthlyMode,
    monthday,
    position,
    monthWeekday,
    until,
  })
  const summary = $derived(summarize(current))

  // 1..31 then "Last day" (value -1) — the day-of-month select options.
  const MONTHDAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1)

  const MODES: { id: RecurrenceFreq; label: string }[] = [
    { id: 'none', label: 'Does not repeat' },
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'custom', label: 'Custom' },
  ]

  function emit() {
    onChange(buildRRule(current))
  }
  function setFreq(next: RecurrenceFreq) {
    freq = next
    if (next === 'custom' && interval < 1) interval = 2
    if (next === 'monthly') {
      // Seed sensible defaults from the task's date so Monthly doesn't always
      // start at day 1.
      const d = monthlyDefaultsFor(startDate)
      monthday = d.monthday
      position = d.position
      monthWeekday = d.monthWeekday
    }
    emit()
  }
  function toggleWeekday(code: string) {
    weekdays = weekdays.includes(code) ? weekdays.filter((d) => d !== code) : [...weekdays, code]
    emit()
  }
  function onInterval(event: Event) {
    const n = Number((event.target as HTMLInputElement).value)
    interval = Math.max(1, Math.floor(n) || 1)
    emit()
  }
  function setUnit(next: 'day' | 'week') {
    unit = next
    emit()
  }
  function setMonthlyMode(next: MonthlyMode) {
    monthlyMode = next
    emit()
  }
  function clearUnknown() {
    unknownRule = null
    freq = 'none'
    emit()
  }
  function onUntil(event: Event) {
    // A native date input emits ISO `YYYY-MM-DD` (our wire format); empty ⇒ never.
    until = (event.target as HTMLInputElement).value || null
    emit()
  }
  function clearUntil() {
    until = null
    emit()
  }
</script>

<div class="space-y-2">
  <span class="block text-xs font-medium text-sage">Repeat</span>

  {#if unknownRule}
    <div
      class="flex items-center justify-between gap-2 rounded-lg border border-lichen bg-surface px-3 py-2"
    >
      <span class="text-sm text-ink">Repeats on a custom schedule</span>
      <button
        type="button"
        onclick={clearUnknown}
        class="rounded-lg px-2 py-1 text-xs font-medium text-sage transition hover:bg-bark/10 hover:text-bark"
      >
        Clear
      </button>
    </div>
  {:else}
    <div class="flex flex-wrap gap-1">
      {#each MODES as option (option.id)}
        <button
          type="button"
          onclick={() => setFreq(option.id)}
          aria-pressed={freq === option.id}
          class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition {freq === option.id
            ? 'border-pine bg-pine/10 text-pine'
            : 'border-lichen text-sage hover:border-pine/40 hover:text-pine-deep'}"
        >
          {option.label}
        </button>
      {/each}
    </div>

    {#if freq === 'weekly'}
      <div class="flex flex-wrap gap-1">
        {#each WEEKDAY_OPTIONS as day (day.code)}
          <button
            type="button"
            onclick={() => toggleWeekday(day.code)}
            aria-pressed={weekdays.includes(day.code)}
            class="h-7 w-9 rounded-lg border text-xs font-medium transition {weekdays.includes(
              day.code,
            )
              ? 'border-pine bg-pine/10 text-pine'
              : 'border-lichen text-sage hover:border-pine/40 hover:text-pine-deep'}"
          >
            {day.label}
          </button>
        {/each}
      </div>
    {/if}

    {#if freq === 'monthly'}
      <div class="space-y-2">
        <div class="flex gap-1">
          <button
            type="button"
            onclick={() => setMonthlyMode('monthday')}
            aria-pressed={monthlyMode === 'monthday'}
            class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition {monthlyMode ===
            'monthday'
              ? 'border-pine bg-pine/10 text-pine'
              : 'border-lichen text-sage hover:border-pine/40 hover:text-pine-deep'}"
          >
            On a date
          </button>
          <button
            type="button"
            onclick={() => setMonthlyMode('weekday')}
            aria-pressed={monthlyMode === 'weekday'}
            class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition {monthlyMode ===
            'weekday'
              ? 'border-pine bg-pine/10 text-pine'
              : 'border-lichen text-sage hover:border-pine/40 hover:text-pine-deep'}"
          >
            On a weekday
          </button>
        </div>

        {#if monthlyMode === 'monthday'}
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-sage">Repeat on the</span>
            <select
              bind:value={monthday}
              onchange={emit}
              aria-label="Day of the month"
              class="rounded-lg border border-lichen bg-surface px-2 py-1.5 text-sm text-ink outline-none transition focus:border-pine"
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
            <select
              bind:value={position}
              onchange={emit}
              aria-label="Which week"
              class="rounded-lg border border-lichen bg-surface px-2 py-1.5 text-sm text-ink outline-none transition focus:border-pine"
            >
              {#each ORDINAL_OPTIONS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
            <select
              bind:value={monthWeekday}
              onchange={emit}
              aria-label="Weekday"
              class="rounded-lg border border-lichen bg-surface px-2 py-1.5 text-sm text-ink outline-none transition focus:border-pine"
            >
              {#each WEEKDAY_LONG as day (day.code)}
                <option value={day.code}>{day.label}</option>
              {/each}
            </select>
          </div>
          {#if position === 5}
            <p class="text-xs text-sage">Months without a fifth one are skipped.</p>
          {/if}
        {/if}
      </div>
    {/if}

    {#if freq === 'custom'}
      <div class="flex items-center gap-2">
        <span class="text-xs text-sage">Every</span>
        <input
          type="number"
          min="1"
          max="365"
          value={interval}
          oninput={onInterval}
          aria-label="Repeat interval"
          class="w-16 rounded-lg border border-lichen bg-surface px-2 py-1.5 text-sm text-ink outline-none transition focus:border-pine"
        />
        <div class="flex gap-1">
          <button
            type="button"
            onclick={() => setUnit('day')}
            aria-pressed={unit === 'day'}
            class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition {unit === 'day'
              ? 'border-pine bg-pine/10 text-pine'
              : 'border-lichen text-sage hover:border-pine/40 hover:text-pine-deep'}"
          >
            days
          </button>
          <button
            type="button"
            onclick={() => setUnit('week')}
            aria-pressed={unit === 'week'}
            class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition {unit === 'week'
              ? 'border-pine bg-pine/10 text-pine'
              : 'border-lichen text-sage hover:border-pine/40 hover:text-pine-deep'}"
          >
            weeks
          </button>
        </div>
      </div>
    {/if}

    {#if freq !== 'none'}
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-sage">Ends</span>
        <input
          type="date"
          value={until ?? ''}
          min={startDate ?? undefined}
          onchange={onUntil}
          aria-label="Repeat end date"
          class="rounded-lg border border-lichen bg-surface px-2 py-1.5 text-sm text-ink outline-none transition focus:border-pine"
        />
        {#if until}
          <button
            type="button"
            onclick={clearUntil}
            class="rounded-lg px-2 py-1 text-xs font-medium text-sage transition hover:bg-bark/10 hover:text-bark"
          >
            Clear
          </button>
        {:else}
          <span class="text-xs text-sage">never</span>
        {/if}
      </div>
      <p class="text-xs text-sage">{summary} · needs a date</p>
    {/if}
  {/if}
</div>
