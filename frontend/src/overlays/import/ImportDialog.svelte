<script lang="ts">
  import Modal from '../../lib/components/Modal.svelte'
  import {
    BTN_SM_CLASS,
    GHOST_BTN_CLASS,
    MODAL_BODY_CLASS,
    PRIMARY_BTN_CLASS,
  } from '../../lib/constants'
  import { skippedRows } from '../../lib/format'
  import {
    DONE,
    IMPORT,
    IMPORT_ANOTHER,
    IMPORT_DONE_NOTE,
    IMPORT_FILE_LABEL,
    IMPORT_INSTRUCTIONS,
    IMPORT_REPEAT_NOTE,
    IMPORT_SUBTITLE,
    IMPORT_TITLE,
    IMPORTING,
  } from '../../lib/messages'
  import { createImport, describeImport } from './import.svelte'

  let { open, onClose }: { open: boolean; onClose: () => void } = $props()

  const importer = createImport()
  let fileInput = $state<HTMLInputElement | null>(null)

  // The input outlives a close, so its chosen file must be cleared by hand.
  function reset() {
    if (importer.reset() && fileInput) fileInput.value = ''
  }
</script>

<Modal
  {open}
  {onClose}
  onOpen={reset}
  title={IMPORT_TITLE}
  subtitle={IMPORT_SUBTITLE}
  error={importer.error}
>
  <div class={MODAL_BODY_CLASS}>
    {#if importer.summary}
      <div class="rounded-xl border border-moss/40 bg-moss/10 px-4 py-3">
        <p class="text-sm font-medium text-pine-deep">{describeImport(importer.summary)}</p>
        {#if importer.summary.skipped > 0}
          <p class="mt-1 text-xs text-sage">{skippedRows(importer.summary.skipped)}</p>
        {/if}
      </div>
      <p class="mt-3 text-xs text-sage">{IMPORT_DONE_NOTE}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" onclick={reset} class="{GHOST_BTN_CLASS} {BTN_SM_CLASS}">
          {IMPORT_ANOTHER}
        </button>
        <button type="button" onclick={onClose} class="{PRIMARY_BTN_CLASS} {BTN_SM_CLASS}">
          {DONE}
        </button>
      </div>
    {:else}
      <p class="text-sm text-ink">{IMPORT_INSTRUCTIONS}</p>
      <input
        bind:this={fileInput}
        type="file"
        accept=".csv,text/csv"
        onchange={(e) => importer.pick(e.currentTarget.files?.[0] ?? null)}
        disabled={importer.pending}
        aria-label={IMPORT_FILE_LABEL}
        class="mt-3 block w-full cursor-pointer rounded-lg border border-lichen bg-fog text-sm text-sage transition file:mr-3 file:cursor-pointer file:border-0 file:border-r file:border-lichen file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-pine hover:file:bg-pine/5 focus:outline-none focus:ring-2 focus:ring-pine"
      />
      <p class="mt-2 text-xs text-sage">{IMPORT_REPEAT_NOTE}</p>
      <div class="mt-4 flex justify-end">
        <button
          type="button"
          onclick={() => void importer.run()}
          disabled={!importer.file || importer.pending}
          class="{PRIMARY_BTN_CLASS} {BTN_SM_CLASS}"
        >
          {importer.pending ? IMPORTING : IMPORT}
        </button>
      </div>
    {/if}
  </div>
</Modal>
