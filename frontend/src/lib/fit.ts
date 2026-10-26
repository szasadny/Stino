/**
 * N lines need `N*lineHeight + (N-1)*gap`; ignoring the gap over-counts and clips lines with
 * no "+N more". Returns `total` until measured, so first paint never shows a wrong "+N more".
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
