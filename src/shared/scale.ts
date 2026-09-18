import type { DeviceSpec } from './device'

export type ScaleMode = 'fit' | 'proportional' | 'true'

export type AvailableArea = {
  width: number
  height: number
}

export function resolveFitScale(device: DeviceSpec, area: AvailableArea): number {
  if (area.width <= 0 || area.height <= 0) return 0

  return Math.min(1, area.width / device.css.width, area.height / device.css.height)
}

export function scaledSize(device: DeviceSpec, scale: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.ceil(device.css.width * scale)),
    height: Math.max(1, Math.ceil(device.css.height * scale)),
  }
}
