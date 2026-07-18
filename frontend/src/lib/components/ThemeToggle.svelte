<script lang="ts">
  import { getThemePref, setThemePref, THEME_OPTIONS, type ThemePref } from '../theme'

  let pref = $state<ThemePref>(getThemePref())

  function choose(next: ThemePref) {
    pref = next
    setThemePref(next)
  }
</script>

<div
  class="inline-flex rounded-lg border border-lichen bg-fog p-0.5"
  role="group"
  aria-label="Theme"
>
  {#each THEME_OPTIONS as option (option.value)}
    <button
      type="button"
      onclick={() => choose(option.value)}
      aria-pressed={pref === option.value}
      class="rounded-md px-3 py-1.5 text-sm font-medium transition {pref === option.value
        ? 'bg-surface text-pine-deep shadow-sm'
        : 'text-sage hover:text-pine-deep'}"
    >
      {option.label}
    </button>
  {/each}
</div>
