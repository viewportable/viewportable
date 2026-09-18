export function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return 'https://example.com'

  if (/^https?:\/\//i.test(trimmed)) return trimmed

  return `https://${trimmed}`
}
