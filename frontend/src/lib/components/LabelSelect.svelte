<script lang="ts">
  // A label picker that, unlike a native <select>, shows each option's color dot
  // and emoji while choosing — so a label is recognizable at a glance, not just
  // by name. Closes on outside-click or Escape. Used wherever a task's label is
  // assigned (Inbox capture + edit). Display-only chrome lives in LabelChip.
  import type { Label } from '../types'
  import LabelChip from './LabelChip.svelte'

  let {
    labels,
    value,
    onChange,
    id,
  }: {
    labels: Label[]
    value: number | null
    onChange: (id: number | null) => void
    id?: string
  } = $props()

  let open = $state(false)
  let container = $state<HTMLDivElement | null>(null)

  const selected = $derived(labels.find((l) => l.id === value) ?? null)

  function choose(next: number | null) {
    onChange(next)
    open = false
  }

  // The window listeners run after the trigger's own onclick: when opening, the
  // target is inside `container`, so this won't immediately re-close it.
  function onWindowPointer(event: MouseEvent) {
    if (open && container && !container.contains(event.target as Node)) open = false
  }
  function onWindowKey(event: KeyboardEvent) {
    if (open && event.key === 'Escape') open = false
  }
</script>

<svelte:window onclick={onWindowPointer} onkeydown={onWindowKey} />

<div class="relative" bind:this={container}>
  <button
    {id}
    type="button"
    onclick={() => (open = !open)}
    aria-haspopup="listbox"
    aria-expanded={open}
    class="flex w-full items-center justify-between gap-2 rounded-lg border border-lichen bg-fog px-2.5 py-1.5 text-sm outline-none transition hover:border-sage focus:border-pine focus:bg-surface focus:ring-2 focus:ring-pine/20"
  >
    {#if selected}
      <LabelChip name={selected.name} color={selected.color} emoji={selected.emoji} />
    {:else}
      <span class="text-sage">None</span>
    {/if}
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-4 w-4 shrink-0 text-sage transition {open ? 'rotate-180' : ''}"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  </button>

  {#if open}
    <ul
      role="listbox"
      class="absolute z-20 mt-1 max-h-60 w-full min-w-[11rem] overflow-y-auto rounded-lg border border-lichen bg-surface p-1 shadow-lift"
    >
      <li>
        <button
          type="button"
          role="option"
          aria-selected={value === null}
          onclick={() => choose(null)}
          class="w-full rounded-md px-2 py-2 text-left text-sm text-sage transition hover:bg-pine/5 {value ===
          null
            ? 'bg-pine/5'
            : ''}"
        >
          None
        </button>
      </li>
      {#each labels as label (label.id)}
        <li>
          <button
            type="button"
            role="option"
            aria-selected={value === label.id}
            onclick={() => choose(label.id)}
            class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition hover:bg-pine/5 {value ===
            label.id
              ? 'bg-pine/5'
              : ''}"
          >
            <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background-color: {label.color}"
            ></span>
            {#if label.emoji}
              <span class="shrink-0 text-base leading-none" aria-hidden="true">{label.emoji}</span>
            {/if}
            <span class="truncate text-sm text-ink">{label.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
