import { describe, expect, it } from 'bun:test'
import { canAccessPubBilling, requiresPubBillingAccess } from './billing-access'

describe('acesso às rotas comerciais do bar', () => {
  it('protege checkout e portal, mas não o webhook assinado', () => {
    expect(requiresPubBillingAccess('/subscription/upgrade')).toBe(true)
    expect(requiresPubBillingAccess('/subscription/billing-portal')).toBe(true)
    expect(requiresPubBillingAccess('/subscription/cancel')).toBe(true)
    expect(requiresPubBillingAccess('/stripe/webhook')).toBe(false)
    expect(requiresPubBillingAccess('/sign-in/email')).toBe(false)
  })

  it('libera somente bar com e-mail verificado', () => {
    expect(canAccessPubBilling({ role: 'pub', emailVerified: true })).toBe(true)
    expect(canAccessPubBilling({ role: 'fan', emailVerified: true })).toBe(
      false
    )
    expect(canAccessPubBilling({ role: 'pub', emailVerified: false })).toBe(
      false
    )
    expect(canAccessPubBilling(null)).toBe(false)
  })
})
