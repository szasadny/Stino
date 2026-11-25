<script lang="ts">
  import ComposerForm from '../../lib/components/composer/ComposerForm.svelte'
  import ErrorAlert from '../../lib/components/ErrorAlert.svelte'
  import IconButton from '../../lib/components/IconButton.svelte'
  import ArrowLeft from './ArrowLeft.svelte'
  import Close from '../../lib/components/icons/Close.svelte'
  import SearchIcon from '../../lib/components/icons/Search.svelte'
  import Modal from '../../lib/components/Modal.svelte'
  import { EDIT_TASK_TITLE } from '../../lib/messages'
  import { createSearch } from './search.svelte'
  import SearchResults from './SearchResults.svelte'

  // Mounted per open, so every open starts on a fresh, focused search field.
  let { onClose }: { onClose: () => void } = $props()

  const search = createSearch()
  const composer = search.composer
</script>

<Modal open {onClose} label="Search" size="xl">
  {#snippet header()}
    {#if composer.open}
      <div class="flex items-center gap-2 border-b border-lichen px-4 py-3">
        <IconButton label="Back to results" onclick={composer.close} class="-ml-1 shrink-0">
          <ArrowLeft />
        </IconButton>
        <h2
          class="min-w-0 flex-1 truncate font-display text-base font-semibold tracking-tight text-pine-deep"
        >
          {EDIT_TASK_TITLE}
        </h2>
        <IconButton label="Close search" onclick={onClose} class="-mr-1 shrink-0">
          <Close />
        </IconButton>
      </div>
    {:else}
      <div class="flex items-center gap-2 border-b border-lichen px-4">
        <SearchIcon class="h-5 w-5 shrink-0 text-sage" />
        <input
          value={search.query}
          oninput={(e) => search.input(e.currentTarget.value)}
          type="search"
          placeholder="Search tasks…"
          autocomplete="off"
          aria-label="Search tasks"
          class="min-w-0 flex-1 bg-transparent py-3.5 text-base text-ink outline-none placeholder:text-sage"
        />
        <IconButton label="Close search" onclick={onClose} class="-mr-1 shrink-0">
          <Close />
        </IconButton>
      </div>
    {/if}
  {/snippet}

  <ErrorAlert error={search.error} class="mx-4 mt-4" />

  <div class="flex-1 overflow-y-auto px-4 py-4">
    {#if composer.open}
      <ComposerForm {composer} />
    {:else}
      <SearchResults {search} />
    {/if}
  </div>
</Modal>
