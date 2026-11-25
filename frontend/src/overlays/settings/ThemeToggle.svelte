<script lang="ts">
  import SegmentedControl from '../../lib/components/SegmentedControl.svelte'
  import { THEME_OPTIONS } from '../../lib/constants'
  import { getThemePref, setThemePref } from '../../lib/theme'
  import type { ThemePref } from '../../lib/types'

  let pref = $state<ThemePref>(getThemePref())

  function choose(next: ThemePref) {
    pref = next
    setThemePref(next)
  }
</script>

<SegmentedControl options={THEME_OPTIONS} value={pref} onChange={choose} label="Theme" />
