import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DEVICE_IDS,
  DEFAULT_DEVICES,
  DEVICE_CATALOG,
  expectedPhysicalWidthMm,
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
