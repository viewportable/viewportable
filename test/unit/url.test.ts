import { describe, expect, it } from 'vitest'
import { normalizeUrl } from '../../src/shared/url'

describe('normalizeUrl', () => {
  it('keeps absolute http and https URLs', () => {
    expect(normalizeUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(normalizeUrl('http://localhost:4173')).toBe('http://localhost:4173')
  })

  it('adds https to bare hostnames', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com')
  })

  it('trims whitespace and falls back for empty input', () => {
    expect(normalizeUrl('  example.com  ')).toBe('https://example.com')
    expect(normalizeUrl('   ')).toBe('https://example.com')
  })
})
