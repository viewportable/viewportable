export type WheelGesture = {
  deltaX: number
  deltaY: number
  shift: boolean
}

export function resolveBoardScrollDelta({
  deltaX,
  deltaY,
  shift,
}: WheelGesture): number | null {
  const horizontalGesture = shift || Math.abs(deltaX) > Math.abs(deltaY)
  if (!horizontalGesture) return null

  const delta = shift && Math.abs(deltaX) <= Math.abs(deltaY) ? deltaY : deltaX
  return Math.abs(delta) < 0.01 ? null : delta
}


export type ViewportWheelGesture = WheelGesture & {
  deltaMode: number
  pageHeight: number
}

export function resolveViewportScrollDelta({
  deltaX,
  deltaY,
  shift,
  deltaMode,
  pageHeight,
}: ViewportWheelGesture): number | null {
  if (shift || Math.abs(deltaX) > Math.abs(deltaY)) return null

  const multiplier = deltaMode === 1 ? 16 : deltaMode === 2 ? Math.max(1, pageHeight) : 1
  const delta = deltaY * multiplier

  return Math.abs(delta) < 0.01 ? null : delta
}
