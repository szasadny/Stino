<script lang="ts">
  import { untrack } from 'svelte'
  import {
    BTN_MD_CLASS,
    BTN_SM_CLASS,
    CHIP_OFF_CLASS,
    CHIP_ON_CLASS,
    CLEAR_BTN_CLASS,
    COMPACT_INPUT_CLASS,
    EMOJI_INPUT_CLASS,
    FIELD_LABEL_CLASS,
    GHOST_BTN_CLASS,
    INPUT_CLASS,
    LABEL_EMOJI_MAX_LENGTH,
    LABEL_EMOJI_SUGGESTIONS,
    LABEL_NAME_MAX_LENGTH,
    PRIMARY_BTN_CLASS,
  } from '../../lib/constants'
  import { labelColorVar } from '../../lib/labels'
  import { LABEL_PALETTE } from '../../lib/palette'
  import type { Label, LabelInput } from '../../lib/types'

  let {
    label,
    busy,
    onSubmit,
    onCancel,
    class: className = '',
  }: {
    label?: Label
    busy: boolean
    onSubmit: (input: LabelInput) => Promise<boolean>
    onCancel?: () => void
    class?: string
  } = $props()

  const DEFAULT_COLOR: string = LABEL_PALETTE[0].hex
  const nameId = $props.id()
  const editing = untrack(() => label != null)
  let nameEl = $state<HTMLInputElement | null>(null)
  let name = $state(untrack(() => label?.name ?? ''))
  let color = $state(untrack(() => label?.color ?? DEFAULT_COLOR))
  let emoji = $state(untrack(() => label?.emoji ?? ''))
  const btnSize = editing ? BTN_SM_CLASS : BTN_MD_CLASS

  export function focus(): void {
    nameEl?.focus()
  }

  $effect(() => {
    if (editing) nameEl?.focus()
  })

  function submit(event: SubmitEvent) {
    event.preventDefault()
    const clean = name.trim()
    if (clean && !busy) void save({ name: clean, color, emoji: emoji.trim() || null })
  }

  async function save(input: LabelInput) {
    if (!(await onSubmit(input)) || editing) return
    name = ''
    color = DEFAULT_COLOR
    emoji = ''
    focus()
  }
</script>

<form onsubmit={submit} class={className}>
  {#if !editing}
    <label for={nameId} class="mb-2 {FIELD_LABEL_CLASS}">New label</label>
  {/if}
  <div class="flex items-center gap-2">
    <input
      id={nameId}
      bind:this={nameEl}
      bind:value={name}
      type="text"
      placeholder={editing ? undefined : 'e.g. Home'}
      maxlength={LABEL_NAME_MAX_LENGTH}
      autocomplete="off"
      aria-label={editing ? 'Label name' : undefined}
      class="min-w-0 flex-1 {editing ? COMPACT_INPUT_CLASS : INPUT_CLASS}"
    />
    {#if onCancel}
      <button type="button" onclick={onCancel} class="{GHOST_BTN_CLASS} {btnSize} shrink-0">
        Cancel
      </button>
    {/if}
    <button
      type="submit"
      disabled={!name.trim() || busy}
      class="{PRIMARY_BTN_CLASS} {btnSize} shrink-0"
    >
      {editing ? 'Save' : 'Add'}
    </button>
  </div>

  <div class="mt-3 flex flex-wrap gap-2" role="group" aria-label="Label color">
    {#each LABEL_PALETTE as swatch (swatch.hex)}
      <button
        type="button"
        onclick={() => (color = swatch.hex)}
        title={swatch.name}
        aria-label={swatch.name}
        aria-pressed={color === swatch.hex}
        class="h-6 w-6 rounded-full ring-offset-2 ring-offset-surface transition {color ===
        swatch.hex
          ? 'ring-2 ring-pine'
          : 'ring-1 ring-lichen hover:ring-sage'}"
      >
        <!-- Inner span: the dot's own box-shadow would override the button's ring. -->
        <span class="label-dot block h-full w-full rounded-full" style={labelColorVar(swatch.hex)}
        ></span>
      </button>
    {/each}
  </div>

  <div class="mt-3">
    <span class={FIELD_LABEL_CLASS}>Emoji <span class="font-normal">(optional)</span></span>
    <div class="mt-1.5 flex items-start gap-2">
      <input
        type="text"
        bind:value={emoji}
        maxlength={LABEL_EMOJI_MAX_LENGTH}
        placeholder="🙂"
        aria-label="Label emoji"
        class={EMOJI_INPUT_CLASS}
      />
      <div class="grid flex-1 grid-cols-6 gap-1" role="group" aria-label="Emoji suggestions">
        {#each LABEL_EMOJI_SUGGESTIONS as suggestion (suggestion)}
          <button
            type="button"
            onclick={() => (emoji = suggestion)}
            aria-label={suggestion}
            aria-pressed={emoji === suggestion}
            class="grid h-9 place-items-center rounded-lg border font-emoji text-lg transition {emoji ===
            suggestion
              ? CHIP_ON_CLASS
              : CHIP_OFF_CLASS}"
          >
            {suggestion}
          </button>
        {/each}
      </div>
      {#if emoji}
        <button
          type="button"
          onclick={() => (emoji = '')}
          class="{CLEAR_BTN_CLASS} h-9 shrink-0 self-start"
        >
          Clear
        </button>
      {/if}
    </div>
  </div>
</form>
