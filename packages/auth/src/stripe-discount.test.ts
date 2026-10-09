import { describe, expect, it } from 'bun:test'
import type Stripe from 'stripe'
import { monthlyDiscountReaisFromStripe } from './stripe-discount'

function subscription(
  discounts: Stripe.Subscription['discounts']
): Stripe.Subscription {
  return { discounts } as Stripe.Subscription
}

describe('monthlyDiscountReaisFromStripe', () => {
  it('sem desconto devolve zero', () => {
    expect(monthlyDiscountReaisFromStripe(subscription([]))).toBe(0)
  })

  it('amount_off em BRL vira reais inteiros (legacy coupon)', () => {
    expect(
      monthlyDiscountReaisFromStripe(
        subscription([
          {
            coupon: { amount_off: 2800, currency: 'brl' }
          } as unknown as Stripe.Discount
        ])
      )
    ).toBe(28)
  })

  it('amount_off em BRL via source.coupon', () => {
    expect(
      monthlyDiscountReaisFromStripe(
        subscription([
          {
            source: {
              type: 'coupon',
              coupon: { amount_off: 2800, currency: 'brl' }
            }
          } as unknown as Stripe.Discount
        ])
      )
    ).toBe(28)
  })

  it('desconto não expandido (id string na lista) devolve null', () => {
    expect(
      monthlyDiscountReaisFromStripe(subscription(['di_unexpanded']))
    ).toBeNull()
  })

  it('cupom não expandido no objeto devolve null', () => {
    expect(
      monthlyDiscountReaisFromStripe(
        subscription([
          {
            source: { type: 'coupon', coupon: 'coupon_1' }
          } as unknown as Stripe.Discount
        ])
      )
    ).toBeNull()
  })
})
