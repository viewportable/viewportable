import { describe, expect, it } from 'vitest'
import { DEVICES, expectedPhysicalWidthMm } from '../../src/shared/device'
import { resolveFitScale, scaledSize } from '../../src/shared/scale'

const phone = DEVICES[0]!

describe('resolveFitScale', () => {
  it('never upscales above 1', () => {
    expect(resolveFitScale(phone, { width: 2000, height: 2000 })).toBe(1)
  })

  it('uses the limiting dimension', () => {
    expect(resolveFitScale(phone, { width: 393, height: 426 })).toBeCloseTo(0.5, 5)
    expect(resolveFitScale(phone, { width: 196.5, height: 2000 })).toBeCloseTo(0.5, 5)
  })

  it('returns zero for a hidden or collapsed host', () => {
    expect(resolveFitScale(phone, { width: 0, height: 500 })).toBe(0)
    expect(resolveFitScale(phone, { width: 500, height: 0 })).toBe(0)
  })
})

describe('scaledSize', () => {
  it('rounds native bounds up while preserving logical dimensions elsewhere', () => {
    expect(scaledSize(phone, 0.5)).toEqual({ width: 197, height: 426 })
  })
})

describe('device physical metadata', () => {
  it.each(DEVICES)('$name physical width agrees with css, DPR and PPI', (device) => {
    expect(expectedPhysicalWidthMm(device)).toBeCloseTo(device.physical.widthMm, 1)
  })
})
