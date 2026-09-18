export type DeviceCategory = 'phone' | 'tablet'

export type DeviceSpec = {
  id: string
  name: string
  category: DeviceCategory
  css: { width: number; height: number }
  dpr: number
  physical?: { widthMm: number; heightMm: number }
  ppi?: number
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

export const DEVICE_CATALOG: DeviceSpec[] = [
  {
    id: 'compact-phone',
    name: 'Compact Phone',
    category: 'phone',
    css: { width: 360, height: 740 },
    dpr: 3,
    typicalViewingDistanceMm: 300,
  },
  {
    id: 'standard-phone',
    name: 'Standard Phone',
    category: 'phone',
    css: { width: 390, height: 844 },
    dpr: 3,
    typicalViewingDistanceMm: 300,
  },
  {
    id: 'iphone-15-pro',
    name: 'iPhone 15 Pro',
    category: 'phone',
    css: { width: 393, height: 852 },
    dpr: 3,
    physical: { widthMm: 65.1, heightMm: 141.15 },
    ppi: 460,
    typicalViewingDistanceMm: 300,
  },
  {
    id: 'large-phone',
    name: 'Large Phone',
    category: 'phone',
    css: { width: 430, height: 932 },
    dpr: 3,
    typicalViewingDistanceMm: 300,
  },
  {
    id: 'compact-tablet',
    name: 'Compact Tablet',
    category: 'tablet',
    css: { width: 768, height: 1024 },
    dpr: 2,
    typicalViewingDistanceMm: 400,
  },
  {
    id: 'pixel-tablet',
    name: 'Pixel Tablet',
    category: 'tablet',
    css: { width: 800, height: 1280 },
    dpr: 2,
    physical: { widthMm: 147.25, heightMm: 235.59 },
    ppi: 276,
    typicalViewingDistanceMm: 400,
  },
]

export const DEFAULT_DEVICE_IDS = ['iphone-15-pro', 'pixel-tablet'] as const

export function getDeviceById(id: string): DeviceSpec | undefined {
  return DEVICE_CATALOG.find((device) => device.id === id)
}

export const DEFAULT_DEVICES = DEFAULT_DEVICE_IDS.map((id) => getDeviceById(id)).filter(
  (device): device is DeviceSpec => device !== undefined,
)

export function expectedPhysicalWidthMm(device: DeviceSpec): number | null {
  if (!device.ppi) return null

  return (device.css.width * device.dpr * 25.4) / device.ppi
}
