import { describe, expect, it } from 'bun:test'
import type Stripe from 'stripe'
import {
  localStatusFor,
  subscriptionIdOf,
  upgradeCouponFor
} from './stripe-sync'

describe('tradução da situação do Stripe (WEB-31)', () => {
  it('segue a tabela', () => {
    expect(localStatusFor('trialing')).toBe('trialing')
    expect(localStatusFor('active')).toBe('active')
    expect(localStatusFor('past_due')).toBe('past_due')
    expect(localStatusFor('unpaid')).toBe('past_due')
    // WEB-60: quem cancelou não se confunde com cobrança pausada.
    expect(localStatusFor('canceled')).toBe('cancelled')
    expect(localStatusFor('paused')).toBe('inactive')
  })

  it('checkout que não virou assinatura não grava nada', () => {
    expect(localStatusFor('incomplete')).toBeNull()
    expect(localStatusFor('incomplete_expired')).toBeNull()
  })
})

const event = (type: string, object: unknown) =>
  ({ type, data: { object } }) as unknown as Stripe.Event

describe('assinatura de que o evento fala', () => {
  it('eventos de assinatura apontam a própria', () => {
    for (const type of [
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted'
    ]) {
      expect(subscriptionIdOf(event(type, { id: 'sub_1' }))).toBe('sub_1')
    }
  })

  it('fim do checkout aponta a assinatura criada', () => {
    expect(
      subscriptionIdOf(
        event('checkout.session.completed', { subscription: 'sub_2' })
      )
    ).toBe('sub_2')
    expect(
      subscriptionIdOf(
        event('checkout.session.completed', { subscription: { id: 'sub_3' } })
      )
    ).toBe('sub_3')
  })

  it('checkout sem assinatura e os demais eventos são ignorados', () => {
    expect(
      subscriptionIdOf(
        event('checkout.session.completed', { subscription: null })
      )
    ).toBeNull()
    expect(subscriptionIdOf(event('invoice.paid', { id: 'in_1' }))).toBeNull()
  })
})

describe('cupom da subida do Pix para o cartão (WEB-536)', () => {
  const sub = (
    metadata: Record<string, string>,
    interval: 'month' | 'year' = 'month'
  ) =>
    ({
      metadata,
      items: { data: [{ price: { recurring: { interval } } }] }
    }) as unknown as Stripe.Subscription

  it('aplica o cupom do servidor numa sessão com diferença', () => {
    expect(
      upgradeCouponFor(
        sub({ pixUpgradeCents: '7285', founderCoupon: 'eM7dQpMF' })
      )
    ).toBe('eM7dQpMF')
    expect(
      upgradeCouponFor(
        sub(
          { pixUpgradeCents: '7285', founderCoupon: 'fundador_anual' },
          'year'
        )
      )
    ).toBe('fundador_anual')
  })

  it('recusa o cupom vindo do corpo do /subscription/upgrade (sem diferença)', () => {
    expect(upgradeCouponFor(sub({ founderCoupon: 'eM7dQpMF' }))).toBeNull()
    expect(
      upgradeCouponFor(sub({ pixUpgradeCents: '0', founderCoupon: 'eM7dQpMF' }))
    ).toBeNull()
  })

  it('recusa cupom fora da lista e o anual numa mensal', () => {
    expect(
      upgradeCouponFor(sub({ pixUpgradeCents: '100', founderCoupon: 'OUTRO' }))
    ).toBeNull()
    expect(
      upgradeCouponFor(
        sub({ pixUpgradeCents: '100', founderCoupon: 'fundador_anual' })
      )
    ).toBeNull()
    expect(
      upgradeCouponFor(
        sub({ pixUpgradeCents: '100', founderCoupon: 'eM7dQpMF' }, 'year')
      )
    ).toBeNull()
  })
})
