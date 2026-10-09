import type Stripe from 'stripe'

type DiscountLike = {
  coupon?: Stripe.Coupon | string | null
}

function discountObjects(subscription: Stripe.Subscription): DiscountLike[] {
  const out: DiscountLike[] = []
  for (const entry of subscription.discounts ?? []) {
    if (entry && typeof entry === 'object') {
      out.push(entry as DiscountLike)
    }
  }
  const legacy = (
    subscription as Stripe.Subscription & {
      discount?: DiscountLike | null
    }
  ).discount
  if (legacy && typeof legacy === 'object') out.push(legacy)
  return out
}

/**
 * Desconto fixo mensal em reais gravado a partir da assinatura no Stripe.
 * `0` = preço de lista; `null` = não deu para inferir (cupom não expandido, etc.).
 */
export function monthlyDiscountReaisFromStripe(
  subscription: Stripe.Subscription
): number | null {
  const discounts = discountObjects(subscription)
  if (discounts.length === 0) return 0

  let totalCents = 0
  let inferred = false

  for (const discount of discounts) {
    const coupon = discount.coupon
    if (!coupon || typeof coupon === 'string') return null
    if (coupon.amount_off != null) {
      const currency = (coupon.currency ?? 'brl').toLowerCase()
      if (currency !== 'brl') return null
      totalCents += coupon.amount_off
      inferred = true
      continue
    }
    if (coupon.percent_off != null) return null
  }

  return inferred ? Math.round(totalCents / 100) : null
}
