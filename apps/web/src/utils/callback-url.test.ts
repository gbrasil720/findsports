import { describe, expect, it } from 'bun:test'
import { getCallbackUrl, withCallbackUrl } from './callback-url'

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

  // Etapas não são destino: o guard tira quem já passou por elas.
  it('skips onboarding and access-pending, keeping what they carried', () => {
    expect(login('/onboarding/pub')).toBe('/dashboard')
    expect(login('/onboarding/fan?callbackUrl=%2Fpub%2Fabc')).toBe('/pub/abc')
    expect(login('/access-pending')).toBe('/dashboard')
    expect(login('/access-pending?callbackUrl=%2Fadmin%3Ftab%3Deventos')).toBe(
      '/admin?tab=eventos'
    )
    expect(login('/onboarding-guia')).toBe('/onboarding-guia')
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

describe('withCallbackUrl', () => {
  const origin = 'http://localhost:3001'

  it('leaves the path alone for the default destination', () => {
    expect(withCallbackUrl('/verify-email', '/dashboard')).toBe('/verify-email')
  })

  it('round-trips through getCallbackUrl, with or without a query', () => {
    for (const path of ['/onboarding/fan', '/verify-email?confirmed=1']) {
      const href = withCallbackUrl(path, '/pub/abc?eventId=x&y=1')
      expect(getCallbackUrl(href, origin)).toBe('/pub/abc?eventId=x&y=1')
    }
    expect(withCallbackUrl('/verify-email?confirmed=1', '/pub/abc')).toBe(
      '/verify-email?confirmed=1&callbackUrl=%2Fpub%2Fabc'
    )
  })
})
