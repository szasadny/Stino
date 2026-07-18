// Pure layout math for phone month cells; capacity comes from measured pixels.

/**
 * How many of `total` task lines to show in `listHeight` px, given a measured
 * per-line `lineHeight` px and the vertical `gap` px between lines (0 for a gapless
 * list). N lines occupy `N*lineHeight + (N-1)*gap`, so capacity is
 * `floor((listHeight + gap) / (lineHeight + gap))` — ignoring the gap would
 * over-count and clip lines with no "+N more" to hint at them. The "+N more" row
 * renders OUTSIDE the measured list (as a sibling that takes its own height), so the
 * full capacity is available for task lines — no row is reserved here. Returns
 * `total` while unmeasured (either dimension `<= 0`), so the first paint shows
 * everything (clipped by `overflow-hidden`) rather than a wrong "+N more" before the
 * ResizeObserver reports real sizes.
 */
export function visibleLineCount(
  total: number,
  listHeight: number,
  lineHeight: number,
  gap = 0,
): number {
  if (total <= 0) return 0
  if (listHeight <= 0 || lineHeight <= 0) return total
  return Math.min(total, Math.floor((listHeight + gap) / (lineHeight + gap)))
}
