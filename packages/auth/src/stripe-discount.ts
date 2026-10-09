import type Stripe from 'stripe'

type DiscountEntry = {
  coupon?: Stripe.Coupon | string | null
  source?: {
    type?: string
    coupon?: Stripe.Coupon | string | null
  }
}

function hasUnexpandedDiscountEntry(
  subscription: Stripe.Subscription
): boolean {
  for (const entry of subscription.discounts ?? []) {
    if (typeof entry === 'string') return true
  }
  const legacy = (
    subscription as Stripe.Subscription & {
      discount?: string | DiscountEntry | null
    }
  ).discount
  return typeof legacy === 'string'
}

function expandedDiscountObjects(
  subscription: Stripe.Subscription
): DiscountEntry[] {
  const out: DiscountEntry[] = []
  for (const entry of subscription.discounts ?? []) {
    if (entry && typeof entry === 'object') {
      out.push(entry as DiscountEntry)
    }
  }
  const legacy = (
    subscription as Stripe.Subscription & {
      discount?: DiscountEntry | null
    }
  ).discount
  if (legacy && typeof legacy === 'object') out.push(legacy)
  return out
}

function couponFromDiscount(
  discount: DiscountEntry
): Stripe.Coupon | string | null | undefined {
  if (discount.source?.type === 'coupon') {
    return discount.source.coupon
  }
  return discount.coupon
}

/**
 * Desconto fixo mensal em reais gravado a partir da assinatura no Stripe.
 * `0` = preço de lista; `null` = não deu para inferir (cupom não expandido, etc.).
 */
export function monthlyDiscountReaisFromStripe(
  subscription: Stripe.Subscription
): number | null {
  if (hasUnexpandedDiscountEntry(subscription)) return null

  const discounts = expandedDiscountObjects(subscription)
  if (discounts.length === 0) return 0

  let totalCents = 0
  let inferred = false

  for (const discount of discounts) {
    const coupon = couponFromDiscount(discount)
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
