<script lang="ts">
  // Unmodelled RRULEs stay read-only and are preserved until explicitly cleared.
  import { untrack } from 'svelte'
  import { prefersReducedMotion } from 'svelte/motion'
  import { slide } from 'svelte/transition'
  import { CLEAR_BTN_CLASS, DISCLOSURE_MS, FIELD_LABEL_CLASS } from '../../constants'
  import { CLEAR, CUSTOM_SCHEDULE, NEEDS_A_DATE, REPEAT } from '../../messages'
  import { summarize } from '../../recurrence/describe'
  import {
    followStart,
    normalizeInterval,
    withFreq,
    withUnit,
    type CustomUnit,
    type RecurrenceFreq,
    type RecurrenceValue,
  } from '../../recurrence/model'
  import { REPEAT_OPTIONS } from '../../recurrence/options'
  import { buildRRule } from '../../recurrence/rrule-build'
  import { isUnmodeledRule, parseRRule } from '../../recurrence/rrule-parse'
  import CustomInterval from './CustomInterval.svelte'
  import MonthlyOptions from './MonthlyOptions.svelte'
  import RepeatEnds from './RepeatEnds.svelte'
  import ToggleChip from './ToggleChip.svelte'
  import WeekdayToggles from './WeekdayToggles.svelte'

  let {
    value,
    startDate = null,
    onChange,
    onFollow,
  }: {
    value: string | null
    startDate?: string | null
    onChange: (rule: string | null) => void
    onFollow: (rule: string | null) => void
  } = $props()

  let unknownRule = $state(untrack(() => (isUnmodeledRule(value) ? value : null)))
  let rec = $state<RecurrenceValue>(untrack(() => parseRRule(value)))
  const summary = $derived(summarize(rec))

  // The rule as last set here; a typed date passes through many values, and each follows from this.
  let base = untrack(() => parseRRule(value))
  // Seeded at mount, so an opened rule that differs from its start stays until the date changes.
  let followedStart = untrack(() => startDate)
  $effect.pre(() => {
    if (startDate === followedStart) return
    followedStart = startDate
    untrack(() => {
      if (base.freq === 'none') return
      rec = followStart(base, startDate)
      onFollow(buildRRule(rec))
    })
  })

  function emit() {
    base = $state.snapshot(rec)
    onChange(buildRRule(rec))
  }
  function setFreq(next: RecurrenceFreq) {
    rec = withFreq(rec, next, startDate)
    emit()
  }
  function setUnit(next: CustomUnit) {
    rec = withUnit(rec, next, startDate)
    emit()
  }
  function setInterval(next: number) {
    rec.interval = normalizeInterval(next)
    emit()
  }
  function setUntil(until: string | null) {
    rec.until = until
    emit()
  }
  function clearUnknown() {
    unknownRule = null
    rec.freq = 'none'
    emit()
  }
</script>

<div class="space-y-2">
  <span class={FIELD_LABEL_CLASS}>{REPEAT}</span>

  {#if unknownRule}
    <div
      class="flex items-center justify-between gap-2 rounded-lg border border-lichen bg-surface px-3 py-2"
    >
      <span class="text-sm text-ink">{CUSTOM_SCHEDULE}</span>
      <button type="button" onclick={clearUnknown} class="{CLEAR_BTN_CLASS} py-1">{CLEAR}</button>
    </div>
  {:else}
    <div class="flex flex-wrap gap-1">
      {#each REPEAT_OPTIONS as option (option.value)}
        <ToggleChip pressed={rec.freq === option.value} onclick={() => setFreq(option.value)}>
          {option.label}
        </ToggleChip>
      {/each}
    </div>

    {#if rec.freq !== 'none'}
      <div
        transition:slide={{ duration: prefersReducedMotion.current ? 0 : DISCLOSURE_MS }}
        class="space-y-2 rounded-lg border border-lichen bg-fog/70 p-2.5"
      >
        {#if rec.freq === 'weekly'}
          <WeekdayToggles bind:weekdays={rec.weekdays} onChange={emit} />
        {:else if rec.freq === 'monthly'}
          <MonthlyOptions
            bind:monthlyMode={rec.monthlyMode}
            bind:monthday={rec.monthday}
            bind:position={rec.position}
            bind:monthWeekday={rec.monthWeekday}
            onChange={emit}
          />
        {:else if rec.freq === 'custom'}
          <CustomInterval
            interval={rec.interval}
            unit={rec.unit}
            onInterval={setInterval}
            onUnit={setUnit}
          />
          {#if rec.unit === 'week'}
            <WeekdayToggles bind:weekdays={rec.weekdays} onChange={emit} />
          {:else if rec.unit === 'month'}
            <MonthlyOptions
              bind:monthlyMode={rec.monthlyMode}
              bind:monthday={rec.monthday}
              bind:position={rec.position}
              bind:monthWeekday={rec.monthWeekday}
              onChange={emit}
            />
          {/if}
        {/if}

        <RepeatEnds until={rec.until} {startDate} onChange={setUntil} />
        <p class="text-xs text-sage">{summary}{startDate ? '' : ` · ${NEEDS_A_DATE}`}</p>
      </div>
    {/if}
  {/if}
</div>
