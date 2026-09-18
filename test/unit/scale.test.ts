import { describe, expect, it } from 'vitest'
import { getDeviceById } from '../../src/shared/device'
import {
  resolveFitScale,
  resolveProportionalScale,
  scaledSize,
} from '../../src/shared/scale'

const phone = getDeviceById('iphone-15-pro')!
const tablet = getDeviceById('pixel-tablet')!

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

describe('resolveProportionalScale', () => {
  it('uses one shared scale constrained by the tightest viewport', () => {
    expect(
      resolveProportionalScale([
        { device: phone, area: { width: 393, height: 852 } },
        { device: tablet, area: { width: 400, height: 640 } },
      ]),
    ).toBeCloseTo(0.5, 5)
  })

  it('ignores collapsed viewport areas', () => {
    expect(
      resolveProportionalScale([
        { device: phone, area: { width: 0, height: 0 } },
        { device: tablet, area: { width: 800, height: 1280 } },
      ]),
    ).toBe(1)
  })
})

describe('scaledSize', () => {
  it('rounds native bounds up while preserving logical dimensions elsewhere', () => {
    expect(scaledSize(phone, 0.5)).toEqual({ width: 197, height: 426 })
  })
})
