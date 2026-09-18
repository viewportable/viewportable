import type { DeviceSpec } from '../shared/device'
import {
  resolveFitScale,
  resolveProportionalScale,
  scaledSize,
  type ActiveScaleMode,
} from '../shared/scale'

export type LayoutRect = {
  x: number
  y: number
  width: number
  height: number
}

export type ViewportLayoutInput = {
  id: string
  device: DeviceSpec
  area: LayoutRect | null
}

export type ViewportLayout = {
  id: string
  visible: boolean
  scale: number | null
  bounds: LayoutRect | null
}

export function resolveViewportLayouts(
  viewports: readonly ViewportLayoutInput[],
  mode: ActiveScaleMode,
): ViewportLayout[] {
  const candidates = viewports
    .filter(({ area }) => area !== null && area.width > 0 && area.height > 0)
    .map(({ device, area }) => ({
      device,
      area: {
        width: area!.width,
        height: area!.height,
      },
    }))

  const sharedScale = mode === 'proportional' ? resolveProportionalScale(candidates) : null

  return viewports.map(({ id, device, area }) => {
    if (!area || area.width <= 0 || area.height <= 0) {
      return hiddenLayout(id)
    }

    const scale =
      mode === 'proportional' ? (sharedScale ?? 0) : resolveFitScale(device, area)

    if (scale <= 0) return hiddenLayout(id)

    const size = scaledSize(device, scale)

    return {
      id,
      visible: true,
      scale,
      bounds: {
        x: Math.round(area.x + Math.max(0, (area.width - size.width) / 2)),
        y: Math.round(area.y + Math.max(0, (area.height - size.height) / 2)),
        width: size.width,
        height: size.height,
      },
    }
  })
}

function hiddenLayout(id: string): ViewportLayout {
  return {
    id,
    visible: false,
    scale: null,
    bounds: null,
  }
}
