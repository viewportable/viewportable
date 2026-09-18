import { describe, expect, it } from 'vitest'
import { resolveViewportLayouts } from '../../src/core/layout'
import { getDeviceById } from '../../src/shared/device'

const phone = getDeviceById('iphone-15-pro')!
const tablet = getDeviceById('pixel-tablet')!

describe('viewport layout core', () => {
  it('fits each viewport independently in Fit mode', () => {
    const layouts = resolveViewportLayouts(
      [
        {
          id: phone.id,
          device: phone,
          area: { x: 0, y: 0, width: 393, height: 852 },
        },
        {
          id: tablet.id,
          device: tablet,
          area: { x: 500, y: 0, width: 400, height: 640 },
        },
      ],
      'fit',
    )

    expect(layouts[0]?.scale).toBe(1)
    expect(layouts[1]?.scale).toBeCloseTo(0.5, 5)
  })

  it('uses one shared scale in Proportional mode', () => {
    const layouts = resolveViewportLayouts(
      [
        {
          id: phone.id,
          device: phone,
          area: { x: 0, y: 0, width: 393, height: 852 },
        },
        {
          id: tablet.id,
          device: tablet,
          area: { x: 500, y: 0, width: 400, height: 640 },
        },
      ],
      'proportional',
    )

    expect(layouts.map((layout) => layout.scale)).toEqual([0.5, 0.5])
  })

  it('excludes collapsed viewports from shared scale and hides them', () => {
    const layouts = resolveViewportLayouts(
      [
        {
          id: phone.id,
          device: phone,
          area: { x: 0, y: 0, width: 0, height: 0 },
        },
        {
          id: tablet.id,
          device: tablet,
          area: { x: 500, y: 0, width: 800, height: 1280 },
        },
      ],
      'proportional',
    )

    expect(layouts[0]).toEqual({
      id: phone.id,
      visible: false,
      scale: null,
      bounds: null,
    })
    expect(layouts[1]?.scale).toBe(1)
    expect(layouts[1]?.visible).toBe(true)
  })

  it('centers the rendered device inside the available area', () => {
    const [layout] = resolveViewportLayouts(
      [
        {
          id: phone.id,
          device: phone,
          area: { x: 100, y: 50, width: 500, height: 500 },
        },
      ],
      'fit',
    )

    expect(layout?.scale).toBeCloseTo(500 / 852, 5)
    expect(layout?.bounds).toEqual({
      x: 235,
      y: 50,
      width: 231,
      height: 500,
    })
  })
})
