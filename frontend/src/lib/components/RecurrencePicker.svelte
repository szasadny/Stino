<script lang="ts">
  // A calm recurrence control for the task edit panel: pick how a task repeats —
  // Does not repeat / Daily / Weekly (toggle weekdays) / Custom (every N
  // days|weeks). Emits the RRULE string (or null) via onChange; the option⇄RRULE
  // mapping lives in lib/recurrence.ts. A stored rule we don't model (e.g. an
  // imported monthly rule) is shown read-only and kept intact unless cleared.
  import { untrack } from 'svelte'
  import {
    buildRRule,
    parseRRule,
    summarize,
    WEEKDAY_OPTIONS,
    type RecurrenceFreq,
    type RecurrenceValue,
  } from '../recurrence'

  let {
    value,
    onChange,
  }: {
    value: string | null
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

  const current = $derived<RecurrenceValue>({ freq, interval, unit, weekdays })
  const summary = $derived(summarize(current))

  const MODES: { id: RecurrenceFreq; label: string }[] = [
    { id: 'none', label: 'Does not repeat' },
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'custom', label: 'Custom' },
  ]

  function emit() {
    onChange(buildRRule(current))
  }
  function setFreq(next: RecurrenceFreq) {
    freq = next
    if (next === 'custom' && interval < 1) interval = 2
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
  function clearUnknown() {
    unknownRule = null
    freq = 'none'
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
      <p class="text-xs text-sage">{summary} · needs a date</p>
    {/if}
  {/if}
</div>
