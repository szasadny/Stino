<script lang="ts">
  // Theme-token fills keep the three-stone mark legible in dark mode.
  let { class: className = '' }: { class?: string } = $props()
</script>

<svg viewBox="0 0 24 24" class={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse
    cx="12"
    cy="18.6"
    rx="7.7"
    ry="2.6"
    fill="rgb(var(--pine))"
    transform="rotate(-3 12 18.6)"
  />
  <ellipse
    cx="12.7"
    cy="12.4"
    rx="5.6"
    ry="2.4"
    fill="rgb(var(--moss))"
    transform="rotate(5 12.7 12.4)"
  />
  <ellipse
    cx="11.3"
    cy="6.8"
    rx="3.7"
    ry="2.1"
    fill="rgb(var(--sage))"
    transform="rotate(-4 11.3 6.8)"
  />
</svg>
