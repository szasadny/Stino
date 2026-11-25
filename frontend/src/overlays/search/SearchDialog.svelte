<script lang="ts">
  import ComposerForm from '../../lib/components/composer/ComposerForm.svelte'
  import IconButton from '../../lib/components/IconButton.svelte'
  import ArrowLeft from './ArrowLeft.svelte'
  import Close from '../../lib/components/icons/Close.svelte'
  import SearchIcon from '../../lib/components/icons/Search.svelte'
  import Modal from '../../lib/components/Modal.svelte'
  import PanelHeader from '../../lib/components/PanelHeader.svelte'
  import { MODAL_BODY_CLASS } from '../../lib/constants'
  import { EDIT_TASK_TITLE } from '../../lib/messages'
  import { createSearch } from './search.svelte'
  import SearchResults from './SearchResults.svelte'

  // Mounted per open, so every open starts on a fresh, focused search field.
  let { onClose }: { onClose: () => void } = $props()

  const search = createSearch()
  const composer = search.composer
</script>

<Modal open {onClose} onEscape={composer.dismiss} label="Search" size="xl" error={search.error}>
  {#snippet header()}
    {#if composer.open}
      <PanelHeader title={EDIT_TASK_TITLE} {onClose} closeLabel="Close search">
        {#snippet leading()}
          <IconButton label="Back to results" onclick={composer.close} class="-ml-1 -mt-1 shrink-0">
            <ArrowLeft />
          </IconButton>
        {/snippet}
      </PanelHeader>
    {:else}
      <div class="flex items-center gap-2 border-b border-lichen px-5">
        <SearchIcon class="h-5 w-5 shrink-0 text-sage" />
        <!-- Remounts when edit mode ends, which hands focus back to the field. -->
        <input
          {@attach (input) => input.focus()}
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

  <div class="flex-1 overflow-y-auto {MODAL_BODY_CLASS}">
    {#if composer.open}
      <ComposerForm {composer} />
    {:else}
      <SearchResults {search} />
    {/if}
  </div>
</Modal>
