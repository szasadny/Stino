import type { Attachment } from 'svelte/attachments'

// showModal() focuses this instead of the first control; the markup attribute trips Svelte's a11y check.
export const autofocus: Attachment<HTMLElement> = (node) => {
  node.autofocus = true
}
