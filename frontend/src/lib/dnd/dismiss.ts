interface EscapePress {
  key: string
  isComposing: boolean
  fromThisDialog: boolean
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

interface DialogPress {
  fallback: boolean
  onBackdrop: boolean
  x: number
  y: number
  box: () => Box
}

// The handler runs last and only for this dialog's own Escape; `true` means it handled one.
export function interceptsEscape(
  press: EscapePress,
  onEscape: (() => boolean) | undefined,
): boolean {
  if (press.key !== 'Escape' || press.isComposing || !onEscape || !press.fromThisDialog)
    return false
  return onEscape()
}

// A press on the dialog element itself but outside its box landed on the backdrop.
export function isOutsidePress(press: DialogPress): boolean {
  if (!press.fallback || !press.onBackdrop) return false
  const box = press.box()
  return press.x < box.left || press.x > box.right || press.y < box.top || press.y > box.bottom
}

// Press and release both outside, so a text selection dragged onto the backdrop keeps it open.
export function dismissesOnRelease(pressedOutside: boolean, release: DialogPress): boolean {
  return pressedOutside && isOutsidePress(release)
}
