<script lang="ts">
  import { BTN_SM_CLASS, MODAL_BODY_CLASS, SECONDARY_BTN_CLASS } from '../../lib/constants'
  import GroupViewToggle from '../../lib/components/GroupViewToggle.svelte'
  import {
    APPEARANCE,
    APPEARANCE_HINT,
    DATA,
    DATA_HINT,
    IMPORT_OPEN,
    SETTINGS,
    SETTINGS_SUBTITLE,
    TASK_ORDER,
    TASK_ORDER_HINT,
    TASKS,
  } from '../../lib/messages'
  import Upload from './Upload.svelte'
  import Modal from '../../lib/components/Modal.svelte'
  import ThemeToggle from './ThemeToggle.svelte'

  let { open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: () => void } =
    $props()
</script>

<Modal {open} {onClose} title={SETTINGS} subtitle={SETTINGS_SUBTITLE}>
  <div class="space-y-6 {MODAL_BODY_CLASS}">
    <section>
      <h3 class="text-sm font-medium text-ink">{APPEARANCE}</h3>
      <p class="mt-0.5 text-xs text-sage">{APPEARANCE_HINT}</p>
      <div class="mt-3">
        <ThemeToggle />
      </div>
    </section>

    <section class="border-t border-lichen pt-5">
      <h3 class="text-sm font-medium text-ink">{TASKS}</h3>
      <p class="mt-0.5 text-xs text-sage">{TASK_ORDER_HINT}</p>
      <GroupViewToggle label={TASK_ORDER} class="mt-3" />
    </section>

    <section class="border-t border-lichen pt-5">
      <h3 class="text-sm font-medium text-ink">{DATA}</h3>
      <p class="mt-0.5 text-xs text-sage">{DATA_HINT}</p>
      <button
        type="button"
        onclick={onImport}
        class="{SECONDARY_BTN_CLASS} {BTN_SM_CLASS} mt-3 inline-flex items-center gap-2"
      >
        <Upload class="h-4 w-4 text-pine" />
        {IMPORT_OPEN}
      </button>
    </section>
  </div>
</Modal>
