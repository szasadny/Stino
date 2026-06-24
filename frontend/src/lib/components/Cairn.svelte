<script lang="ts">
  // The Stinō mark: a small stack of trail stones (a cairn), narrowing upward.
  let { class: className = '' }: { class?: string } = $props()
</script>

<svg
  viewBox="0 0 24 24"
  fill="currentColor"
  class={className}
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
>
  <ellipse cx="12" cy="19" rx="8" ry="2.6" opacity="0.95" />
  <ellipse cx="12" cy="14.2" rx="6" ry="2.3" opacity="0.82" />
  <ellipse cx="12" cy="10" rx="4.4" ry="2" opacity="0.7" />
  <ellipse cx="12" cy="6.4" rx="3" ry="1.7" opacity="0.62" />
</svg>
