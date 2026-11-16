import { expect, test } from 'bun:test'
import { matchesTwoFactorEnable } from './two-factor-enable'

// As duas rotas que ligam o 2FA no better-auth 1.6.22: se o OTP por e-mail ou
// SMS for ligado, o `verify-otp` não pode voltar a manter as sessões antigas.
test('casa as rotas que ligam o 2FA, e só elas', () => {
  expect(matchesTwoFactorEnable({ path: '/two-factor/verify-totp' })).toBe(true)
  expect(matchesTwoFactorEnable({ path: '/two-factor/verify-otp' })).toBe(true)
  for (const path of [
    '/two-factor/enable',
    '/two-factor/verify-backup-code',
    '/sign-in/email',
    undefined
  ]) {
    expect(matchesTwoFactorEnable({ path })).toBe(false)
  }
})
