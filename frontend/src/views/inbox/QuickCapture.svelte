<script lang="ts">
  import {
    BTN_MD_CLASS,
    INPUT_CLASS,
    PRIMARY_BTN_CLASS,
    SECONDARY_BTN_CLASS,
    TITLE_MAX_LENGTH,
  } from '../../lib/constants'
  import { isCompact } from '../../lib/viewport.svelte'
  import Icon from '../../lib/components/icons/Icon.svelte'
  import CapturePreview from './CapturePreview.svelte'
  import LabelListbox from './LabelListbox.svelte'
  import type { QuickCapture } from './quick-capture.svelte'

  let {
    capture,
    busy,
    onDetails,
  }: { capture: QuickCapture; busy: boolean; onDetails: () => void } = $props()

  const listboxId = $props.id()
  let anchor = $state<HTMLDivElement | null>(null)

  function onsubmit(event: SubmitEvent) {
    event.preventDefault()
    void capture.submit()
  }
</script>

<form class="mt-5 shrink-0 rounded-xl border border-lichen bg-surface p-3 shadow-soft" {onsubmit}>
  <div class="flex items-center gap-2">
    <div class="relative min-w-0 flex-1" bind:this={anchor}>
      <input
        bind:this={capture.input}
        bind:value={capture.text}
        oninput={capture.onInput}
        onkeydown={capture.keydown}
        onkeyup={capture.syncCaret}
        onclick={capture.syncCaret}
        type="text"
        placeholder={isCompact() ? 'gym tomorrow 9am' : 'call mum tomorrow 6pm #social'}
        maxlength={TITLE_MAX_LENGTH}
        autocomplete="off"
        aria-label="New task title"
        role="combobox"
        aria-expanded={capture.menuOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        class="w-full {INPUT_CLASS}"
      />
      {#if capture.menuOpen}
        <LabelListbox
          id={listboxId}
          rows={capture.suggestions}
          active={capture.highlight}
          {anchor}
          keepFocus
          onChoose={capture.choose}
          onHover={capture.hover}
          onDismiss={capture.dismiss}
        />
      {/if}
    </div>
    <button
      type="button"
      onclick={onDetails}
      disabled={busy}
      title="Add with full details"
      class="{SECONDARY_BTN_CLASS} {BTN_MD_CLASS} flex shrink-0 items-center gap-1.5"
    >
      <Icon class="h-4 w-4" strokeWidth={1.8}>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </Icon>
      <span class="hidden sm:inline">Details</span>
    </button>
    <button
      type="submit"
      disabled={!capture.text.trim() || busy}
      class="{PRIMARY_BTN_CLASS} {BTN_MD_CLASS} shrink-0"
    >
      Add
    </button>
  </div>
  <CapturePreview
    label={capture.label}
    preview={capture.preview}
    onClearLabel={capture.clearLabel}
  />
</form>
