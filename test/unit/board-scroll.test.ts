import { describe, expect, it } from 'vitest'
import {
  resolveBoardScrollDelta,
  resolveGlobalScrollDelta,
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

  it('routes vertical shell gestures into global synchronized scrolling', () => {
    expect(
      resolveGlobalScrollDelta({
        deltaX: 3,
        deltaY: 40,
        shift: false,
      }),
    ).toBe(40)
  })

  it('keeps horizontal and Shift+wheel gestures out of global vertical scrolling', () => {
    expect(
      resolveGlobalScrollDelta({
        deltaX: 40,
        deltaY: 4,
        shift: false,
      }),
    ).toBeNull()

    expect(
      resolveGlobalScrollDelta({
        deltaX: 0,
        deltaY: 40,
        shift: true,
      }),
    ).toBeNull()
  })
})
