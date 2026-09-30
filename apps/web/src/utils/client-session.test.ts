import { describe, expect, test } from 'bun:test'
import { toClientSession } from './auth-guards'

type BetterAuthSession = Parameters<typeof toClientSession>[0]

describe('toClientSession', () => {
  test('o token do cookie httpOnly não sai do servidor', () => {
    const fromBetterAuth = {
      user: { id: 'u1', role: 'pub' },
      session: {
        id: 's1',
        userId: 'u1',
        token: 'cookie-httponly',
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
        expiresAt: new Date('2030-01-01'),
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        impersonatedBy: 'admin-1'
      }
    } as unknown as BetterAuthSession

    const client = toClientSession(fromBetterAuth)

    expect(JSON.stringify(client)).not.toContain('cookie-httponly')
    expect(client?.session).toEqual({
      id: 's1',
      userId: 'u1',
      expiresAt: new Date('2030-01-01'),
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      impersonatedBy: 'admin-1'
    })
    expect(client?.user).toBe(fromBetterAuth?.user)
  })

  test('sem sessão continua null', () => {
    expect(toClientSession(null)).toBeNull()
  })
})
