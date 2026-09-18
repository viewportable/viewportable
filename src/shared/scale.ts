import type { DeviceSpec } from './device'

export const ACTIVE_SCALE_MODES = ['fit', 'proportional'] as const

export type ActiveScaleMode = (typeof ACTIVE_SCALE_MODES)[number]
export type ScaleMode = ActiveScaleMode | 'true'

export type AvailableArea = {
  width: number
  height: number
}

export type ScaleCandidate = {
  device: DeviceSpec
  area: AvailableArea
}

export function resolveFitScale(device: DeviceSpec, area: AvailableArea): number {
  if (area.width <= 0 || area.height <= 0) return 0

  return Math.min(1, area.width / device.css.width, area.height / device.css.height)
}

export function resolveProportionalScale(candidates: readonly ScaleCandidate[]): number {
  const scales = candidates
    .map(({ device, area }) => resolveFitScale(device, area))
    .filter((scale) => scale > 0)

  return scales.length > 0 ? Math.min(...scales) : 0
}

export function scaledSize(device: DeviceSpec, scale: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.ceil(device.css.width * scale)),
    height: Math.max(1, Math.ceil(device.css.height * scale)),
  }
}
