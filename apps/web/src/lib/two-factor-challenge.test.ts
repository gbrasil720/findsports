import { describe, expect, test } from 'bun:test'
import {
  createTwoFactorChallenge,
  isTwoFactorChallengeCurrent
} from './two-factor-challenge'

describe('two-factor login challenge navigation state', () => {
  test('keeps only safe internal callback paths', () => {
    expect(createTwoFactorChallenge('/admin?tab=1', 100).callbackUrl).toBe(
      '/admin?tab=1'
    )
    expect(
      createTwoFactorChallenge('https://evil.example', 100).callbackUrl
    ).toBe('/')
    expect(createTwoFactorChallenge('//evil.example', 100).callbackUrl).toBe(
      '/'
    )
    expect(createTwoFactorChallenge('/\\evil.example', 100).callbackUrl).toBe(
      '/'
    )
  })

  test('expires with the Better Auth two-factor cookie window', () => {
    const challenge = createTwoFactorChallenge('/dashboard', 1_000)
    expect(isTwoFactorChallengeCurrent(challenge, 600_999)).toBe(true)
    expect(isTwoFactorChallengeCurrent(challenge, 601_000)).toBe(false)
  })

  test('rejects malformed persisted data', () => {
    expect(isTwoFactorChallengeCurrent(null, 1_000)).toBe(false)
    expect(
      isTwoFactorChallengeCurrent(
        { callbackUrl: 'https://evil.example', startedAt: 500 },
        1_000
      )
    ).toBe(false)
  })
})
