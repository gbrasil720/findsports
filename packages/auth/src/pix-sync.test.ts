import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import type { AbacateSubscription } from './abacatepay'
import {
  founderSeatsFull,
  parsePixExternalId,
  pixExternalId,
  pixFounderDiscountReais,
  pixProductExternalId,
  pixStanding,
  readLagsBehind,
  trustedPixRef
} from './pix-sync'
import { stripeClient } from './stripe-client'

describe('externalId do checkout Pix', () => {
  it('volta o bar, o plano e o fundador que entraram', () => {
    const id = pixExternalId('bar-1', 'elite', true)
    expect(parsePixExternalId(id)).toEqual({
      barId: 'bar-1',
      plan: 'elite',
      founder: true,
      annual: false
    })
    expect(parsePixExternalId(pixExternalId('bar-2', 'pro', false))).toEqual({
      barId: 'bar-2',
      plan: 'pro',
      founder: false,
      annual: false
    })
  })

  it('anual: o `:y` no fim, e o checkout de antes dele segue mensal', () => {
    expect(
      parsePixExternalId(pixExternalId('bar-3', 'pro', true, true))
    ).toEqual({ barId: 'bar-3', plan: 'pro', founder: true, annual: true })
    expect(parsePixExternalId('onside:bar-4:elite:t:abcd1234')).toEqual({
      barId: 'bar-4',
      plan: 'elite',
      founder: false,
      annual: false
    })
    expect(parsePixExternalId('onside:bar-4:elite:t:abcd1234:x')).toBeNull()
    expect(pixFounderDiscountReais(true)).toBe(280)
    expect(pixFounderDiscountReais(false)).toBe(28)
  })

  it('recusa o que não foi o app que criou', () => {
    expect(parsePixExternalId(null)).toBeNull()
    expect(parsePixExternalId('assinatura-123')).toBeNull()
    expect(parsePixExternalId('onside:bar:gold:f:x')).toBeNull()
    expect(parsePixExternalId('onside:bar:pro:z:x')).toBeNull()
  })
})

describe('situação do Pix sem depender da ordem dos avisos', () => {
  const dez = new Date('2026-12-12T23:59:59Z')
  const jan = new Date('2027-01-12T23:59:59Z')
  const standing = (
    eventType: string,
    periodEnd: Date,
    existing: { status: 'active' | 'past_due'; currentPeriodEnd: Date } | null,
    isCurrent = true
  ) => pixStanding({ eventType, periodEnd, existing, isCurrent })

  it('primeiro pagamento: ativa', () => {
    expect(standing('subscription.completed', dez, null, false)).toBe('active')
  })

  it('débito recusado sem o ciclo avançar: em atraso', () => {
    const existing = { status: 'active' as const, currentPeriodEnd: dez }
    expect(standing('subscription.payment_failed', dez, existing)).toBe(
      'past_due'
    )
  })

  it('recusa antiga chegando depois da renovação: segue ativa', () => {
    // A renovação já gravou janeiro; a assinatura relida também diz janeiro.
    const existing = { status: 'active' as const, currentPeriodEnd: dez }
    expect(standing('subscription.payment_failed', jan, existing)).toBe(
      'active'
    )
  })

  it('pagamento antigo chegando depois da recusa: segue em atraso', () => {
    const existing = { status: 'past_due' as const, currentPeriodEnd: dez }
    expect(standing('subscription.completed', dez, existing)).toBe('past_due')
  })

  it('anual: o ciclo pago vai um ano à frente e a recusa antiga não pega', () => {
    const ano = new Date('2027-12-12T23:59:59Z')
    const existing = { status: 'active' as const, currentPeriodEnd: dez }
    expect(standing('subscription.renewed', ano, existing)).toBe('active')
    expect(standing('subscription.payment_failed', ano, existing)).toBe(
      'active'
    )
    expect(
      standing('subscription.payment_failed', ano, {
        status: 'active',
        currentPeriodEnd: ano
      })
    ).toBe('past_due')
  })

  it('nova tentativa que passa avança o ciclo: volta a ativa', () => {
    const existing = { status: 'past_due' as const, currentPeriodEnd: dez }
    expect(standing('subscription.renewed', jan, existing)).toBe('active')
  })
})

describe('leitura da AbacatePay atrás do aviso', () => {
  it('pago com a assinatura ainda pendente: reenviar depois', () => {
    expect(readLagsBehind('subscription.completed', 'PENDING')).toBe(true)
    expect(readLagsBehind('subscription.renewed', 'PENDING')).toBe(true)
    expect(readLagsBehind('subscription.completed', 'ACTIVE')).toBe(false)
  })

  it('cancelado com a assinatura ainda viva: reenviar depois', () => {
    expect(readLagsBehind('subscription.cancelled', 'ACTIVE')).toBe(true)
    expect(readLagsBehind('subscription.cancelled', 'CANCELLED')).toBe(false)
  })

  it('recusa de débito não depende da leitura', () => {
    expect(readLagsBehind('subscription.payment_failed', 'ACTIVE')).toBe(false)
  })
})

describe('vaga de fundador com o Stripe sem responder', () => {
  // O dublê responde antes da contagem: o banco não é tocado.
  it('não trava o aviso: conta como não esgotou, com o motivo no log', async () => {
    const spy = spyOn(stripeClient.coupons, 'retrieve').mockImplementation(
      (async () => {
        throw Object.assign(new Error('Invalid API Key provided'), {
          type: 'StripeAuthenticationError'
        })
      }) as unknown as typeof stripeClient.coupons.retrieve
    )
    const error = spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await founderSeatsFull()).toBe(false)
      const logged = String(error.mock.calls[0]?.[0])
      expect(logged).toContain('pix_founder_seat_unverified')
      expect(logged).toMatch(/stripe_key_missing|stripe_unavailable/)
    } finally {
      spy.mockRestore()
      error.mockRestore()
    }
  })
})

describe('bar e plano do aviso Pix vêm da AbacatePay, não do corpo', () => {
  // Dublê da AbacatePay: o produto é `prod_<externalId>`, e o checkout da
  // assinatura é o que o teste puser em `checkout`.
  let checkout: { externalId: string | null; items: { id: string }[] }
  const realFetch = globalThis.fetch
  const fetchSpy = () =>
    spyOn(globalThis, 'fetch').mockImplementation((async (
      input: string | URL | Request
    ) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      const data = url.pathname.endsWith('/products/get')
        ? { id: `prod_${url.searchParams.get('externalId')}` }
        : url.pathname.endsWith('/subscriptions/checkouts/get')
          ? {
              id: url.searchParams.get('id'),
              url: '',
              status: 'PAID',
              ...checkout
            }
          : null
      return Response.json({ data, error: data ? null : 'não dublada' })
    }) as typeof fetch)
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const sub = (checkoutId: string | null) =>
    ({ id: 'subs_1', checkoutId, status: 'ACTIVE' }) as AbacateSubscription
  const starter = pixExternalId('bar-1', 'starter', false)
  const eliteFounderAnnual = pixExternalId('bar-2', 'elite', true, true)

  async function refusalOf(run: () => Promise<unknown>) {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await run()).toBeNull()
      return JSON.parse(String(error.mock.calls[0]?.[0])) as {
        event: string
        reason: string
      }
    } finally {
      error.mockRestore()
    }
  }

  it('o produto pedido no checkout é o do externalId', () => {
    expect(
      pixProductExternalId({ plan: 'elite', founder: true, annual: true })
    ).toBe('elite_founder_yearly')
    expect(
      pixProductExternalId({ plan: 'starter', founder: false, annual: false })
    ).toBe('starter_monthly')
  })

  it('checkout que bate: o bar e o plano dele', async () => {
    fetchSpy()
    checkout = {
      externalId: eliteFounderAnnual,
      items: [{ id: 'prod_elite_founder_yearly' }]
    }
    expect(await trustedPixRef(sub('bill_1'), eliteFounderAnnual)).toEqual({
      barId: 'bar-2',
      plan: 'elite',
      founder: true,
      annual: true
    })
    // Corpo sem o externalId: vale o do checkout.
    expect((await trustedPixRef(sub('bill_1'), null))?.plan).toBe('elite')
  })

  it('pagou o Starter e mandou um Elite de fundador anual no corpo: recusado', async () => {
    fetchSpy()
    checkout = { externalId: starter, items: [{ id: 'prod_starter_monthly' }] }
    expect(
      await refusalOf(() => trustedPixRef(sub('bill_1'), eliteFounderAnnual))
    ).toMatchObject({
      event: 'pix_webhook_untrusted',
      reason: 'external_id_mismatch'
    })
  })

  it('produto do checkout diferente do que o externalId diz: recusado', async () => {
    fetchSpy()
    checkout = {
      externalId: eliteFounderAnnual,
      items: [{ id: 'prod_starter_monthly' }]
    }
    expect(
      await refusalOf(() => trustedPixRef(sub('bill_1'), eliteFounderAnnual))
    ).toMatchObject({ reason: 'product_mismatch' })
  })

  it('sem checkout: vai ao log e lança, para a AbacatePay reenviar', async () => {
    fetchSpy()
    const error = spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(trustedPixRef(sub(null), starter)).rejects.toThrow(
        'sem checkoutId'
      )
      expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({
        event: 'pix_webhook_untrusted',
        reason: 'no_checkout'
      })
    } finally {
      error.mockRestore()
    }
  })

  it('checkout que não é do app: recusado', async () => {
    fetchSpy()
    checkout = { externalId: 'outro-sistema', items: [] }
    expect(
      await refusalOf(() => trustedPixRef(sub('bill_1'), null))
    ).toMatchObject({ reason: 'unknown_external_id' })
  })
})
