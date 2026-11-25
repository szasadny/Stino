<script lang="ts">
  import type { Composer } from '../../controllers/composer.svelte'
  import Modal from '../Modal.svelte'
  import ComposerForm from './ComposerForm.svelte'

  let { composer }: { composer: Composer } = $props()
</script>

<Modal open={composer.open} onClose={composer.close} title={composer.title} size="sheet-lg">
  <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
    {#if composer.open}
      <ComposerForm {composer} />
    {/if}
  </div>
</Modal>
