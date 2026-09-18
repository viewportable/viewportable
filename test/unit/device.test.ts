import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DEVICE_IDS,
  DEFAULT_DEVICES,
  DEVICE_CATALOG,
  expectedPhysicalWidthMm,
  resolveDeviceSelection,
} from '../../src/shared/device'

describe('device catalog', () => {
  it('keeps ids unique', () => {
    const ids = DEVICE_CATALOG.map((device) => device.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('groups phones and tablets', () => {
    expect(DEVICE_CATALOG.some((device) => device.category === 'phone')).toBe(true)
    expect(DEVICE_CATALOG.some((device) => device.category === 'tablet')).toBe(true)
  })

  it('falls back to the default board for an invalid persisted selection', () => {
    expect(resolveDeviceSelection(['missing-device']).map((device) => device.id)).toEqual([
      ...DEFAULT_DEVICE_IDS,
    ])
  })

  it('deduplicates a persisted selection while preserving order', () => {
    expect(
      resolveDeviceSelection(['pixel-tablet', 'iphone-15-pro', 'pixel-tablet']).map(
        (device) => device.id,
      ),
    ).toEqual(['pixel-tablet', 'iphone-15-pro'])
  })

  it('keeps verified physical metadata internally consistent', () => {
    for (const device of DEVICE_CATALOG) {
      if (!device.physical || !device.ppi) continue

      expect(expectedPhysicalWidthMm(device)).toBeCloseTo(device.physical.widthMm, 1)
    }
  })

  it('has two devices on the default board', () => {
    expect(DEFAULT_DEVICES.map((device) => device.id)).toEqual([...DEFAULT_DEVICE_IDS])
  })
})
