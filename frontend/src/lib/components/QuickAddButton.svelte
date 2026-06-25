<script lang="ts">
  // The small "+" quick-add affordance in a calendar day header (month + week cells).
  // Clicking it adds a task straight onto that day, skipping the day sheet. The two grids
  // reveal it differently: the dense month grid keeps it desktop-hover-only (hidden on a
  // phone, where the day sheet's own "Add a task" covers it), while the roomy week grid
  // shows it on a phone too — `alwaysOnMobile` picks between the two. On desktop both reveal
  // on cell hover/focus (the parent cell is a Tailwind `group`).
  let {
    onAdd,
    label,
    alwaysOnMobile = false,
  }: {
    onAdd: () => void
    label: string
    alwaysOnMobile?: boolean
  } = $props()

  const reveal = $derived(
    alwaysOnMobile
      ? 'grid sm:opacity-0 sm:group-hover:opacity-100'
      : 'hidden opacity-0 group-hover:opacity-100 sm:grid',
  )
</script>

<button
  type="button"
  onclick={onAdd}
  aria-label={label}
  class="h-6 w-6 shrink-0 place-items-center rounded-full text-sage transition hover:bg-pine/10 hover:text-pine-deep focus-visible:opacity-100 {reveal}"
>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="h-3.5 w-3.5"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
</button>
