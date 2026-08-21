import { describe, expect, test } from 'bun:test'
import {
  type AuthSession,
  applyAuthGuards,
  requiresAuthentication
} from './auth-guards'

function session(role: 'fan' | 'pub' | 'admin', onboardingCompleted = true) {
  return {
    session: {
      id: 's1',
      userId: 'u1',
      expiresAt: new Date('2030-01-01'),
      token: 't',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01')
    },
    user: {
      id: 'u1',
      name: 'Torcedor',
      email: 'fan@example.com',
      emailVerified: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      role,
      onboardingCompleted,
      searchRadiusKm: 5,
      twoFactorEnabled: false
    }
  } satisfies NonNullable<AuthSession>
}

describe('requiresAuthentication', () => {
  test('protects known app surfaces and their nested paths', () => {
    expect(requiresAuthentication('/dashboard')).toBe(true)
    expect(requiresAuthentication('/dashboard/profile')).toBe(true)
    expect(requiresAuthentication('/admin')).toBe(true)
    expect(requiresAuthentication('/admin/billing')).toBe(true)
    expect(requiresAuthentication('/plan')).toBe(true)
    expect(requiresAuthentication('/internal')).toBe(true)
    expect(requiresAuthentication('/internal/waitlist')).toBe(true)
  })

  test('leaves marketing, auth, pubs, onboarding and unknown URLs public', () => {
    expect(requiresAuthentication('/')).toBe(false)
    expect(requiresAuthentication('/login')).toBe(false)
    expect(requiresAuthentication('/signup')).toBe(false)
    expect(requiresAuthentication('/pub/abc')).toBe(false)
    expect(requiresAuthentication('/onboarding/fan')).toBe(false)
    expect(requiresAuthentication('/pagina-que-nao-existe')).toBe(false)
    expect(requiresAuthentication('/api/trpc/pubs.list')).toBe(false)
  })
})

describe('applyAuthGuards', () => {
  test('sends visitors on protected routes to login', () => {
    expect(() => applyAuthGuards(null, '/dashboard')).toThrow()
    expect(() => applyAuthGuards(null, '/admin')).toThrow()
  })

  test('lets visitors stay on unknown URLs so the 404 can render', () => {
    expect(() => applyAuthGuards(null, '/pagina-que-nao-existe')).not.toThrow()
  })

  test('keeps onboarding reachable without a session', () => {
    expect(() => applyAuthGuards(null, '/onboarding/fan')).not.toThrow()
  })

  test('sends unfinished fans to fan onboarding', () => {
    expect(() => applyAuthGuards(session('fan', false), '/dashboard')).toThrow()
  })
})
