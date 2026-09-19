import { describe, expect, it } from 'vitest'
import {
  normalizeScrollProgress,
  resolveScrollProgress,
  resolveSyncedScrollY,
} from '../../src/core/sync'

describe('scroll synchronization', () => {
  it('normalizes a source scroll position to document progress', () => {
    expect(resolveScrollProgress(450, 1900, 1000)).toBe(0.5)
  })

  it('does not emit progress for a document that cannot scroll', () => {
    expect(resolveScrollProgress(0, 800, 800)).toBeNull()
    expect(resolveScrollProgress(0, 500, 800)).toBeNull()
  })

  it('maps progress to a target document with a different height', () => {
    expect(resolveSyncedScrollY(0.5, 3000, 1000)).toBe(1000)
  })

  it('clamps progress to the valid range', () => {
    expect(normalizeScrollProgress(-0.2)).toBe(0)
    expect(normalizeScrollProgress(1.4)).toBe(1)
  })
})
