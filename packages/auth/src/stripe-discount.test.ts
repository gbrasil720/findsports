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

  it('amount_off em BRL vira reais inteiros', () => {
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

  it('cupom não expandido devolve null', () => {
    expect(
      monthlyDiscountReaisFromStripe(
        subscription([{ coupon: 'coupon_1' } as unknown as Stripe.Discount])
      )
    ).toBeNull()
  })
})
