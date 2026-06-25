<script lang="ts">
  // TickTick CSV import: pick a file → api.import.ticktick → a friendly
  // created/skipped summary. The dialog shell (header, close, backdrop) lives in
  // Modal; this owns the picker, the request, and the result.
  import { api } from '../api'
  import type { ImportSummary } from '../types'
  import { PRIMARY_BTN_CLASS } from '../constants'
  import { errorMessage } from '../errors'
  import ErrorAlert from './ErrorAlert.svelte'
  import Modal from './Modal.svelte'

  let { open, onClose }: { open: boolean; onClose: () => void } = $props()

  let file = $state<File | null>(null)
  let busy = $state(false)
  let error = $state<string | null>(null)
  let summary = $state<ImportSummary | null>(null)

  // Reset to a clean slate each time the dialog opens.
  function reset() {
    file = null
    error = null
    summary = null
    busy = false
  }

  function pick(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    file = input.files?.[0] ?? null
    error = null
  }

  async function runImport() {
    if (!file || busy) return
    busy = true
    error = null
    try {
      summary = await api.import.ticktick(file)
    } catch (e) {
      error = errorMessage(e, 'Could not import the file')
    } finally {
      busy = false
    }
  }

  // "Imported 12 tasks and 3 labels." — only mentions the parts that happened.
  function describe(s: ImportSummary): string {
    const parts: string[] = [count(s.created.tasks, 'task')]
    if (s.created.labels > 0) parts.push(count(s.created.labels, 'label'))
    if (s.created.completions > 0) parts.push(`${s.created.completions} already done`)
    return `Imported ${joinParts(parts)}.`
  }

  function count(n: number, noun: string): string {
    return `${n} ${noun}${n === 1 ? '' : 's'}`
  }

  function joinParts(parts: string[]): string {
    if (parts.length === 1) return parts[0]
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  }
</script>

<Modal
  {open}
  {onClose}
  onOpen={reset}
  title="Import from TickTick"
  subtitle="Bring in a CSV backup. Only adds — never deletes."
>
  <ErrorAlert {error} class="mx-5 mt-4" />

  <div class="px-5 py-5">
    {#if summary}
      <!-- Result -->
      <div class="rounded-xl border border-moss/40 bg-moss/10 px-4 py-3">
        <p class="text-sm font-medium text-pine-deep">{describe(summary)}</p>
        {#if summary.skipped > 0}
          <p class="mt-1 text-xs text-sage">
            {count(summary.skipped, 'row')} skipped (no title to import).
          </p>
        {/if}
      </div>
      <p class="mt-3 text-xs text-sage">Open a view to see your imported tasks.</p>
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onclick={reset}
          class="rounded-lg px-3 py-2 text-sm font-medium text-sage transition hover:text-pine-deep"
        >
          Import another
        </button>
        <button type="button" onclick={onClose} class="{PRIMARY_BTN_CLASS} px-4 py-2">
          Done
        </button>
      </div>
    {:else}
      <!-- File picker -->
      <p class="text-sm text-ink">
        Export your data from TickTick as a CSV backup, then choose the file here.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onchange={pick}
        disabled={busy}
        aria-label="TickTick CSV file"
        class="mt-3 block w-full cursor-pointer rounded-lg border border-lichen bg-fog text-sm text-sage transition file:mr-3 file:cursor-pointer file:border-0 file:border-r file:border-lichen file:bg-surface file:px-4 file:py-2 file:text-sm file:font-medium file:text-pine hover:file:bg-pine/5 focus:outline-none focus:ring-2 focus:ring-pine/40"
      />
      <div class="mt-4 flex justify-end">
        <button
          type="button"
          onclick={runImport}
          disabled={!file || busy}
          class="{PRIMARY_BTN_CLASS} px-4 py-2"
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>
    {/if}
  </div>
</Modal>
