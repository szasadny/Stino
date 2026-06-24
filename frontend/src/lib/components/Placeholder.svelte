<script lang="ts">
  // Calm empty-state used by the skeleton's view stubs until each gets its slice.
  let { title, subtitle }: { title: string; subtitle: string } = $props()
</script>

<section class="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8">
  <h1 class="text-xl font-semibold text-pine-deep">{title}</h1>
  <p class="mt-1 text-sm text-sage">{subtitle}</p>
  <div
    class="mt-6 grid place-items-center rounded-xl border border-lichen bg-surface p-12 text-center shadow-sm"
  >
    <p class="max-w-sm text-sm text-sage">
      Part of the walking skeleton — this view comes alive in its feature slice.
    </p>
  </div>
</section>
