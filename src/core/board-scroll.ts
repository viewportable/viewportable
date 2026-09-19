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
