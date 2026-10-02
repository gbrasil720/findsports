import { describe, expect, it } from 'bun:test'
import { getCallbackUrl } from './callback-url'

// `href` chega relativo, como o TanStack Router entrega em `useLocation()`.
describe('getCallbackUrl', () => {
  const origin = 'http://localhost:3001'
  const login = (callbackUrl: string) =>
    getCallbackUrl(
      `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
      origin
    )

  it('returns /dashboard when no callbackUrl', () => {
    expect(getCallbackUrl('/some-page?foo=bar', origin)).toBe('/dashboard')
    expect(getCallbackUrl('/login', origin)).toBe('/dashboard')
  })

  it('returns a relative callbackUrl with its query', () => {
    expect(login('/pub/abc123?eventId=xyz&source=email')).toBe(
      '/pub/abc123?eventId=xyz&source=email'
    )
  })

  it('returns pathname+search from an absolute same-origin callbackUrl', () => {
    expect(login(`${origin}/pub/abc123?eventId=xyz`)).toBe(
      '/pub/abc123?eventId=xyz'
    )
  })

  it('accepts a relative callbackUrl without an explicit origin', () => {
    expect(getCallbackUrl('/login?callbackUrl=%2Fpub%2Fabc')).toBe('/pub/abc')
  })

  it.each([
    'http://evil.com/pub/abc',
    'http://localhost:3002/pub/abc',
    '//evil.com/pub/abc',
    '/\\evil.com/pub/abc',
    '\\\\evil.com/pub/abc',
    '/\t/evil.com/pub/abc',
    'javascript:alert(1)',
    'data:text/html,hi'
  ])('returns /dashboard for other-origin callbackUrl %p', (callbackUrl) => {
    expect(login(callbackUrl)).toBe('/dashboard')
  })
})
