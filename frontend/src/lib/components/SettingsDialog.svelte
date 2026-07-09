<script lang="ts">
  // Settings: groups appearance (the theme toggle), task ordering, and data
  // tools (TickTick import). The dialog shell (header, close, backdrop,
  // open/close) lives in Modal; the import launcher hands back to the parent so
  // the existing ImportDialog runs on its own.
  import { groupByLabelView, setGroupByLabelView } from '../group-view.svelte'
  import Modal from './Modal.svelte'
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
      <div
        class="mt-3 inline-flex rounded-lg border border-lichen bg-fog p-0.5"
        role="group"
        aria-label="Task order"
      >
        <button
          type="button"
          onclick={() => setGroupByLabelView(false)}
          aria-pressed={!groupByLabelView()}
          class="rounded-md px-3 py-1.5 text-sm font-medium transition {!groupByLabelView()
            ? 'bg-surface text-pine-deep shadow-sm'
            : 'text-sage hover:text-pine-deep'}"
        >
          List
        </button>
        <button
          type="button"
          onclick={() => setGroupByLabelView(true)}
          aria-pressed={groupByLabelView()}
          class="rounded-md px-3 py-1.5 text-sm font-medium transition {groupByLabelView()
            ? 'bg-surface text-pine-deep shadow-sm'
            : 'text-sage hover:text-pine-deep'}"
        >
          By label
        </button>
      </div>
    </section>

    <section class="border-t border-lichen pt-5">
      <h3 class="text-sm font-medium text-ink">Data</h3>
      <p class="mt-0.5 text-xs text-sage">Bring tasks in from another app.</p>
      <button
        type="button"
        onclick={onImport}
        class="mt-3 inline-flex items-center gap-2 rounded-lg border border-lichen bg-fog px-4 py-2 text-sm font-medium text-pine-deep transition hover:bg-pine/5"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="h-4 w-4 text-pine"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5-5 5 5" />
          <path d="M12 5v12" />
        </svg>
        Import from TickTick…
      </button>
    </section>
  </div>
</Modal>
