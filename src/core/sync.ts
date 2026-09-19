export function normalizeScrollProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function resolveScrollProgress(
  scrollY: number,
  scrollHeight: number,
  viewportHeight: number,
): number | null {
  const maxScrollY = Math.max(0, scrollHeight - viewportHeight)
  if (maxScrollY <= 0) return null

  return normalizeScrollProgress(scrollY / maxScrollY)
}

export function resolveSyncedScrollY(
  progress: number,
  scrollHeight: number,
  viewportHeight: number,
): number {
  const maxScrollY = Math.max(0, scrollHeight - viewportHeight)
  return maxScrollY * normalizeScrollProgress(progress)
}
