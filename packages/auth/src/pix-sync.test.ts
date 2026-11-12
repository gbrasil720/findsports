import { describe, expect, it } from 'bun:test'
import {
  parsePixExternalId,
  pixExternalId,
  pixStanding,
  readLagsBehind
} from './pix-sync'

describe('externalId do checkout Pix', () => {
  it('volta o bar, o plano e o fundador que entraram', () => {
    const id = pixExternalId('bar-1', 'elite', true)
    expect(parsePixExternalId(id)).toEqual({
      barId: 'bar-1',
      plan: 'elite',
      founder: true
    })
    expect(parsePixExternalId(pixExternalId('bar-2', 'pro', false))).toEqual({
      barId: 'bar-2',
      plan: 'pro',
      founder: false
    })
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
