export type DeviceSpec = {
  id: string
  name: string
  css: { width: number; height: number }
  dpr: number
  physical: { widthMm: number; heightMm: number }
  ppi: number
  typicalViewingDistanceMm: number
}

export type BrowserProfile = {
  id: string
  name: string
  engine: 'chromium'
  userAgent: string
  touch: boolean
  maxTouchPoints: number
}

const CHROMIUM_MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 15; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36'

export const MOBILE_CHROMIUM_PROFILE: BrowserProfile = {
  id: 'chromium-mobile',
  name: 'Chromium mobile emulation',
  engine: 'chromium',
  userAgent: CHROMIUM_MOBILE_UA,
  touch: true,
  maxTouchPoints: 5,
}

export const DEVICES: DeviceSpec[] = [
  {
    id: 'iphone-15-pro',
    name: 'iPhone 15 Pro',
    css: { width: 393, height: 852 },
    dpr: 3,
    physical: { widthMm: 65.1, heightMm: 141.15 },
    ppi: 460,
    typicalViewingDistanceMm: 300,
  },
  {
    id: 'pixel-tablet',
    name: 'Pixel Tablet',
    css: { width: 800, height: 1280 },
    dpr: 2,
    physical: { widthMm: 147.25, heightMm: 235.59 },
    ppi: 276,
    typicalViewingDistanceMm: 400,
  },
]

export function expectedPhysicalWidthMm(device: DeviceSpec): number {
  return (device.css.width * device.dpr * 25.4) / device.ppi
}
