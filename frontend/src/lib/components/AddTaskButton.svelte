<script lang="ts">
  import { ADD_A_TASK } from '../messages'
  import Plus from './icons/Plus.svelte'

  let { onclick, class: className = '' }: { onclick: () => void; class?: string } = $props()
</script>

<button
  type="button"
  {onclick}
  class="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-lichen px-3 text-sm font-medium text-sage transition hover:border-pine/40 hover:bg-pine/[0.04] hover:text-pine-deep {className}"
>
  <Plus class="h-4 w-4" />
  {ADD_A_TASK}
</button>
