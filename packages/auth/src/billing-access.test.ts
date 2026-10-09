import { describe, expect, it } from 'bun:test'
import {
  blocksNewCheckout,
  canAccessPubBilling,
  requiresPubBillingAccess
} from './billing-access'

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

  it('só a assinatura parada no provedor impede checkout novo (WEB-172)', () => {
    const sub = (status: string, externalSubscriptionId: string | null) => ({
      status,
      externalSubscriptionId
    })
    expect(blocksNewCheckout(sub('past_due', 'sub_1'))).toBe(true)
    // Viva: o plugin troca o plano na mesma assinatura, sem checkout.
    expect(blocksNewCheckout(sub('active', 'sub_1'))).toBe(false)
    expect(blocksNewCheckout(sub('trialing', 'sub_1'))).toBe(false)
    // Nada no provedor, ou já encerrada: contratar é o caminho.
    expect(blocksNewCheckout(sub('trialing', null))).toBe(false)
    expect(blocksNewCheckout(sub('past_due', null))).toBe(false)
    expect(blocksNewCheckout(sub('inactive', 'sub_1'))).toBe(false)
    expect(blocksNewCheckout(null)).toBe(false)
  })
})
