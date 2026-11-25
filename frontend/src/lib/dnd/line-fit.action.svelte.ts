import type { Attachment } from 'svelte/attachments'
import { visibleLineCount } from './fit'
import { isShadowItem } from './zone-options'

// Attach `measure` to the list; it re-reads on resize and whenever its children change.
export function createLineFit(count: () => number) {
  let listHeight = $state(0)
  let lineHeight = $state(0)
  let rowGap = $state(0)
  const visible = $derived(visibleLineCount(count(), listHeight, lineHeight, rowGap))

  const measure: Attachment<HTMLElement> = (list) => {
    const read = () => {
      listHeight = list.clientHeight
      const first = list.firstElementChild
      if (first) lineHeight = first.getBoundingClientRect().height
    }
    rowGap = parseFloat(getComputedStyle(list).rowGap) || 0
    read()
    const resize = new ResizeObserver(read)
    const children = new MutationObserver(read)
    resize.observe(list)
    children.observe(list, { childList: true })
    return () => {
      resize.disconnect()
      children.disconnect()
    }
  }

  return {
    get overflow() {
      return count() - visible
    },
    // Children must match dnd items, so overflow lines hide with `invisible`, never removal.
    hides(index: number, item: object): boolean {
      return index >= visible && !isShadowItem(item)
    },
    measure,
  }
}
