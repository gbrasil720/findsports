import { describe, expect, test } from 'bun:test'
import { getPageSurface } from './page-surface'

describe('getPageSurface', () => {
  test('maps product routes to a coarse surface', () => {
    expect(getPageSurface('/')).toBe('landing')
    expect(getPageSurface('/login')).toBe('auth')
    expect(getPageSurface('/signup')).toBe('auth')
    expect(getPageSurface('/onboarding/fan')).toBe('activation')
    expect(getPageSurface('/plan')).toBe('activation')
    expect(getPageSurface('/dashboard')).toBe('fan')
    expect(getPageSurface('/dashboard/profile')).toBe('fan')
    expect(getPageSurface('/pub/abc')).toBe('fan')
    expect(getPageSurface('/admin')).toBe('pub')
    expect(getPageSurface('/admin/billing')).toBe('pub')
    expect(getPageSurface('/internal/waitlist')).toBe('other')
  })
})
