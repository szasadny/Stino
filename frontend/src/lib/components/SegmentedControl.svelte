<script lang="ts" generics="T">
  let {
    options,
    value,
    onChange,
    label,
    size = 'md',
    class: className = '',
  }: {
    options: { value: T; label: string }[]
    value: T
    onChange: (value: T) => void
    label: string
    size?: 'sm' | 'md'
    class?: string
  } = $props()
</script>

<div
  class="inline-flex rounded-lg border border-lichen bg-fog p-0.5 {className}"
  role="group"
  aria-label={label}
>
  {#each options as option (option.label)}
    <button
      type="button"
      onclick={() => onChange(option.value)}
      aria-pressed={value === option.value}
      class="rounded-md font-medium transition {size === 'sm'
        ? 'px-2.5 py-1 text-xs'
        : 'px-3 py-1.5 text-sm'} {value === option.value
        ? 'bg-surface text-pine-deep shadow-soft'
        : 'text-sage hover:text-pine-deep'}"
    >
      {option.label}
    </button>
  {/each}
</div>
