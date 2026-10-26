<script lang="ts">
  // Unmodelled RRULEs stay read-only and are preserved until explicitly cleared.
  import { untrack } from 'svelte'
  import { slide } from 'svelte/transition'
  import MonthlyOptions from './MonthlyOptions.svelte'
  import WeekdayToggles from './WeekdayToggles.svelte'
  import {
    buildRRule,
    isUnmodeledRule,
    monthlyDefaultsFor,
    parseRRule,
    summarize,
    type CustomUnit,
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

  const parsed = untrack(() => parseRRule(value))
  let unknownRule = $state(untrack(() => (isUnmodeledRule(value) ? value : null)))

  let freq = $state<RecurrenceFreq>(parsed.freq)
  let interval = $state(parsed.interval)
  let unit = $state<CustomUnit>(parsed.unit)
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

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const MODES: { id: RecurrenceFreq; label: string }[] = [
    { id: 'none', label: 'Does not repeat' },
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'yearly', label: 'Yearly' },
    { id: 'custom', label: 'Custom' },
  ]

  const UNITS: { id: CustomUnit; label: string }[] = [
    { id: 'day', label: 'days' },
    { id: 'week', label: 'weeks' },
    { id: 'month', label: 'months' },
  ]

  function emit() {
    onChange(buildRRule(current))
  }
  function setFreq(next: RecurrenceFreq) {
    freq = next
    if (next === 'custom' && interval < 1) interval = 2
    if (next === 'monthly') applyMonthlyDefaults()
    emit()
  }
  function applyMonthlyDefaults() {
    const d = monthlyDefaultsFor(startDate)
    monthday = d.monthday
    position = d.position
    monthWeekday = d.monthWeekday
  }
  function onInterval(event: Event) {
    const n = Number((event.target as HTMLInputElement).value)
    interval = Math.max(1, Math.floor(n) || 1)
    emit()
  }
  function setUnit(next: CustomUnit) {
    if (next === 'month' && unit !== 'month') applyMonthlyDefaults()
    unit = next
    emit()
  }
  function clearUnknown() {
    unknownRule = null
    freq = 'none'
    emit()
  }
  function onUntil(event: Event) {
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

    {#if freq !== 'none'}
      <div
        transition:slide={{ duration: reduceMotion ? 0 : 150 }}
        class="space-y-2 rounded-lg border border-lichen bg-fog/70 p-2.5"
      >
        {#if freq === 'weekly'}
          <WeekdayToggles bind:weekdays onChange={emit} />
        {/if}

        {#if freq === 'monthly'}
          <MonthlyOptions
            bind:monthlyMode
            bind:monthday
            bind:position
            bind:monthWeekday
            onChange={emit}
          />
        {/if}

        {#if freq === 'custom'}
          <div class="flex flex-wrap items-center gap-2">
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
              {#each UNITS as option (option.id)}
                <button
                  type="button"
                  onclick={() => setUnit(option.id)}
                  aria-pressed={unit === option.id}
                  class="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition {unit ===
                  option.id
                    ? 'border-pine bg-pine/10 text-pine'
                    : 'border-lichen text-sage hover:border-pine/40 hover:text-pine-deep'}"
                >
                  {option.label}
                </button>
              {/each}
            </div>
          </div>
          {#if unit === 'week'}
            <WeekdayToggles bind:weekdays onChange={emit} />
          {:else if unit === 'month'}
            <MonthlyOptions
              bind:monthlyMode
              bind:monthday
              bind:position
              bind:monthWeekday
              onChange={emit}
            />
          {/if}
        {/if}

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
        <p class="text-xs text-sage">{summary}{startDate ? '' : ' · needs a date'}</p>
      </div>
    {/if}
  {/if}
</div>
