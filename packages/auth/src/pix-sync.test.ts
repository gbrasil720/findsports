import { describe, expect, it } from 'bun:test'
import {
  parsePixExternalId,
  pixExternalId,
  pixFounderDiscountReais,
  pixStanding,
  readLagsBehind
} from './pix-sync'

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
