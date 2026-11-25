<script lang="ts">
  import type { Composer } from '../../controllers/composer.svelte'
  import { MODAL_BODY_CLASS } from '../../constants'
  import Modal from '../Modal.svelte'
  import ComposerForm from './ComposerForm.svelte'

  let { composer }: { composer: Composer } = $props()
</script>

<Modal
  open={composer.open}
  onClose={composer.close}
  title={composer.title}
  size="sheet-lg"
  error={composer.error}
>
  <div class="flex-1 overflow-y-auto {MODAL_BODY_CLASS}">
    {#if composer.open}
      <ComposerForm {composer} />
    {/if}
  </div>
</Modal>
