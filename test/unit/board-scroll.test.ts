import { describe, expect, it } from 'vitest'
import {
  resolveBoardScrollDelta,
  resolveViewportScrollDelta,
} from '../../src/core/board-scroll'

describe('board scroll routing', () => {
  it('routes a horizontal trackpad gesture to the board', () => {
    expect(resolveBoardScrollDelta({ deltaX: 42, deltaY: 7, shift: false })).toBe(42)
  })

  it('leaves a vertical gesture with the viewport page', () => {
    expect(resolveBoardScrollDelta({ deltaX: 4, deltaY: 38, shift: false })).toBeNull()
  })

  it('maps Shift + wheel to horizontal board movement', () => {
    expect(resolveBoardScrollDelta({ deltaX: 0, deltaY: 120, shift: true })).toBe(120)
  })

  it('ignores zero-length gestures', () => {
    expect(resolveBoardScrollDelta({ deltaX: 0, deltaY: 0, shift: false })).toBeNull()
  })

  it('routes vertical gutter gestures to the selected viewport', () => {
    expect(
      resolveViewportScrollDelta({
        deltaX: 3,
        deltaY: 40,
        shift: false,
        deltaMode: 0,
        pageHeight: 600,
      }),
    ).toBe(40)
  })

  it('keeps horizontal and Shift+wheel gestures out of viewport proxy scrolling', () => {
    expect(
      resolveViewportScrollDelta({
        deltaX: 40,
        deltaY: 4,
        shift: false,
        deltaMode: 0,
        pageHeight: 600,
      }),
    ).toBeNull()

    expect(
      resolveViewportScrollDelta({
        deltaX: 0,
        deltaY: 40,
        shift: true,
        deltaMode: 0,
        pageHeight: 600,
      }),
    ).toBeNull()
  })
})
