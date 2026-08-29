import { describe, expect, it } from 'bun:test'

import {
  hashWaitlistToken,
  isLaunchNoticeEligible,
  normalizeWaitlistEmail,
  shouldAdmitSignup
} from './waitlist-workflow'

describe('waitlist workflow', () => {
  it('normalizes the email that owns the enrollment', () => {
    expect(normalizeWaitlistEmail('  Fan@Exemplo.COM ')).toBe('fan@exemplo.com')
  })

  it('stores a deterministic digest instead of the invitation token', async () => {
    const token = 'token-secreto-com-mais-de-trinta-e-dois-caracteres'
    const first = await hashWaitlistToken(token)
    expect(first).toBe(await hashWaitlistToken(token))
    expect(first).not.toContain(token)
    expect(first).toHaveLength(64)
  })

  it('lets the persisted runtime mode open an invite-only deploy', () => {
    expect(shouldAdmitSignup({ signupClosed: false, approved: false })).toBe(
      true
    )
    expect(shouldAdmitSignup({ signupClosed: true, approved: false })).toBe(
      false
    )
    expect(shouldAdmitSignup({ signupClosed: true, approved: true })).toBe(true)
  })

  it('never sends the public notice twice or over a valid invite', () => {
    const base = {
      confirmedAt: new Date(),
      cancelledAt: null,
      activatedAt: null,
      inviteExpiresAt: null,
      launchNoticeSentAt: null
    }
    expect(isLaunchNoticeEligible(base, new Date())).toBe(true)
    expect(
      isLaunchNoticeEligible(
        { ...base, inviteExpiresAt: new Date(Date.now() + 60_000) },
        new Date()
      )
    ).toBe(false)
    expect(
      isLaunchNoticeEligible(
        { ...base, launchNoticeSentAt: new Date() },
        new Date()
      )
    ).toBe(false)
  })
})
