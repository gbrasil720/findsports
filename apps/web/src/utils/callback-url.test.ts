import { describe, expect, it } from 'bun:test'
import { getCallbackUrl } from './callback-url'

describe('getCallbackUrl', () => {
  const baseHref = 'http://localhost:3001/some-page?foo=bar'

  it('returns /dashboard when no callbackUrl', () => {
    expect(getCallbackUrl(baseHref)).toBe('/dashboard')
  })

  it('returns /dashboard when callbackUrl is missing', () => {
    expect(getCallbackUrl('http://localhost:3001/login')).toBe('/dashboard')
  })

  it('returns pathname+search from same-origin callbackUrl', () => {
    const href =
      'http://localhost:3001/login?callbackUrl=http%3A%2F%2Flocalhost%3A3001%2Fpub%2Fabc123%3FeventId%3Dxyz'
    const result = getCallbackUrl(href)
    expect(result).toBe('/pub/abc123?eventId=xyz')
  })

  it('returns /dashboard for cross-origin callbackUrl', () => {
    const href =
      'http://localhost:3001/login?callbackUrl=http%3A%2F%2Fevil.com%2Fsteal'
    expect(getCallbackUrl(href)).toBe('/dashboard')
  })

  it('returns /dashboard for malformed callbackUrl', () => {
    const href = 'http://localhost:3001/login?callbackUrl=not-a-url'
    expect(getCallbackUrl(href)).toBe('/dashboard')
  })

  it('preserves search params from callbackUrl', () => {
    const href =
      'http://localhost:3001/login?callbackUrl=http%3A%2F%2Flocalhost%3A3001%2Fpub%2F123%3FeventId%3Dabc%26source%3Demail'
    const result = getCallbackUrl(href)
    expect(result).toBe('/pub/123?eventId=abc&source=email')
  })
})
