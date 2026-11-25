<script lang="ts">
  import { BTN_SM_CLASS, SECONDARY_BTN_CLASS } from '../../lib/constants'
  import GroupViewToggle from '../../lib/components/GroupViewToggle.svelte'
  import Upload from './Upload.svelte'
  import Modal from '../../lib/components/Modal.svelte'
  import ThemeToggle from './ThemeToggle.svelte'

  let { open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: () => void } =
    $props()
</script>

<Modal {open} {onClose} title="Settings" subtitle="Appearance, tasks, and data.">
  <div class="space-y-6 px-5 py-5">
    <section>
      <h3 class="text-sm font-medium text-ink">Appearance</h3>
      <p class="mt-0.5 text-xs text-sage">Follows your system unless you pick Light or Dark.</p>
      <div class="mt-3">
        <ThemeToggle />
      </div>
    </section>

    <section class="border-t border-lichen pt-5">
      <h3 class="text-sm font-medium text-ink">Tasks</h3>
      <p class="mt-0.5 text-xs text-sage">
        Order each day's list by label, or by your manual order.
      </p>
      <GroupViewToggle label="Task order" class="mt-3" />
    </section>

    <section class="border-t border-lichen pt-5">
      <h3 class="text-sm font-medium text-ink">Data</h3>
      <p class="mt-0.5 text-xs text-sage">Bring tasks in from another app.</p>
      <button
        type="button"
        onclick={onImport}
        class="{SECONDARY_BTN_CLASS} {BTN_SM_CLASS} mt-3 inline-flex items-center gap-2"
      >
        <Upload class="h-4 w-4 text-pine" />
        Import from TickTick…
      </button>
    </section>
  </div>
</Modal>
