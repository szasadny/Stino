<script lang="ts">
  import { COMPACT_INPUT_CLASS } from '../../constants'
  import { EVERY, REPEAT_INTERVAL } from '../../messages'
  import { MAX_CUSTOM_INTERVAL, type CustomUnit } from '../../recurrence/model'
  import { CUSTOM_UNIT_OPTIONS } from '../../recurrence/options'
  import ToggleChip from './ToggleChip.svelte'

  let {
    interval,
    unit,
    onInterval,
    onUnit,
  }: {
    interval: number
    unit: CustomUnit
    onInterval: (interval: number) => void
    onUnit: (unit: CustomUnit) => void
  } = $props()
</script>

<div class="flex flex-wrap items-center gap-2">
  <span class="text-xs text-sage">{EVERY}</span>
  <input
    type="number"
    min="1"
    max={MAX_CUSTOM_INTERVAL}
    value={interval}
    oninput={(e) => onInterval(Number(e.currentTarget.value))}
    aria-label={REPEAT_INTERVAL}
    class="w-16 {COMPACT_INPUT_CLASS}"
  />
  <div class="flex gap-1">
    {#each CUSTOM_UNIT_OPTIONS as option (option.value)}
      <ToggleChip pressed={unit === option.value} onclick={() => onUnit(option.value)}>
        {option.label}
      </ToggleChip>
    {/each}
  </div>
</div>
