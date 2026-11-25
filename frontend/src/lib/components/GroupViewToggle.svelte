<script lang="ts">
  import { GROUP_VIEW_OPTIONS } from '../constants'
  import { groupByLabelView, setGroupByLabelView } from '../group-view.svelte'
  import SegmentedControl from './SegmentedControl.svelte'

  let {
    label,
    size = 'md',
    class: className = '',
  }: { label: string; size?: 'sm' | 'md'; class?: string } = $props()
</script>

<SegmentedControl
  options={GROUP_VIEW_OPTIONS}
  value={groupByLabelView()}
  onChange={setGroupByLabelView}
  {label}
  {size}
  class={className}
/>
