import { MediaQuery } from 'svelte/reactivity'
import { COARSE_POINTER_QUERY, COMPACT_MAX_WIDTH } from './constants'

const compact = new MediaQuery(`(max-width: ${COMPACT_MAX_WIDTH}px)`)
const coarsePointer = new MediaQuery(COARSE_POINTER_QUERY)

// Views render ONE layout from this, never both via CSS, so dnd zones never duplicate.
export function isCompact(): boolean {
  return compact.current
}

export function isCoarsePointer(): boolean {
  return coarsePointer.current
}
