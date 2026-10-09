import { describe, expect, it } from 'bun:test'
import { trialEndForCheckout } from './stripe-checkout'

const now = new Date('2026-10-09T12:00:00Z')
const HOUR = 60 * 60 * 1000
const inHours = (h: number) => new Date(now.getTime() + h * HOUR)
const seconds = (date: Date) => Math.floor(date.getTime() / 1000)

const trial = (currentPeriodEnd: Date | null) => ({
  status: 'trialing',
  currentPeriodEnd,
  externalSubscriptionId: null
})

describe('fim do teste grátis herdado pelo checkout (WEB-31)', () => {
  it('em teste: a primeira cobrança é no fim do teste do cadastro', () => {
    const end = inHours(24 * 100)
    expect(trialEndForCheckout(trial(end), now)).toBe(seconds(end))
  })

  it('faltando menos de dois dias: o mínimo que o Stripe aceita', () => {
    expect(trialEndForCheckout(trial(inHours(5)), now)).toBe(
      seconds(inHours(49))
    )
  })

  it('teste vencido ou sem data: cobra na hora', () => {
    expect(trialEndForCheckout(trial(inHours(-1)), now)).toBeUndefined()
    expect(trialEndForCheckout(trial(null), now)).toBeUndefined()
  })

  it('sem assinatura, ou assinatura que não é teste: cobra na hora', () => {
    expect(trialEndForCheckout(null, now)).toBeUndefined()
    expect(
      trialEndForCheckout({ ...trial(inHours(240)), status: 'inactive' }, now)
    ).toBeUndefined()
  })

  it('teste que já é do Stripe não é herdado de novo', () => {
    expect(
      trialEndForCheckout(
        { ...trial(inHours(240)), externalSubscriptionId: 'sub_1' },
        now
      )
    ).toBeUndefined()
  })
})
