import { describe, expect, it, test } from 'bun:test'
import {
  monthlyPriceReais,
  pixUpgradeCents,
  planForLookupKey,
  STRIPE_PLANS
} from './stripe-plan'

test('cada plano tem a sua lookup key', () => {
  expect(STRIPE_PLANS.map((p) => p.name)).toEqual(['starter', 'pro', 'elite'])
  for (const plan of STRIPE_PLANS) {
    expect(planForLookupKey(plan.lookupKey)).toBe(plan.name)
  }
})

// WEB-442: o anual é o mesmo plano, cobrado por ano.
test('o preço anual vira o mesmo plano do mensal', () => {
  expect(STRIPE_PLANS.map((p) => p.annualDiscountLookupKey)).toEqual([
    'starter_yearly',
    'pro_yearly',
    'elite_yearly'
  ])
  for (const plan of STRIPE_PLANS) {
    expect(planForLookupKey(plan.annualDiscountLookupKey)).toBe(plan.name)
  }
})

test('preço ausente ou desconhecido não vira plano nenhum', () => {
  expect(planForLookupKey(undefined)).toBeNull()
  expect(planForLookupKey(null)).toBeNull()
  expect(planForLookupKey('')).toBeNull()
  expect(planForLookupKey('elite_annual')).toBeNull()
})

describe('diferença da subida do Pix para o cartão (WEB-536)', () => {
  const paidUntil = new Date('2026-12-02T23:59:59Z')
  // O ciclo do Pix: 02/11 a 02/12, 30 dias.
  const daysBefore = (days: number) =>
    new Date(paidUntil.getTime() - days * 86_400_000)

  it('Pro no Pix para Elite no cartão: a diferença pelos dias que faltam', () => {
    expect(
      pixUpgradeCents({
        currentMonthlyReais: 147,
        newMonthlyReais: 297,
        paidUntil,
        now: daysBefore(15)
      })
    ).toBe(7500)
  })

  it('fundador dos dois lados × tabela: a diferença é a dos preços pagos', () => {
    const founder = monthlyPriceReais('pro', { founder: true })
    const elite = monthlyPriceReais('elite', { founder: true })
    expect([founder, elite]).toEqual([119, 269])
    const fromFounder = pixUpgradeCents({
      currentMonthlyReais: founder,
      newMonthlyReais: monthlyPriceReais('elite', { founder: false }),
      paidUntil,
      now: daysBefore(15)
    })
    // 297 − 119 = 178 pela metade do mês.
    expect(fromFounder).toBe(8900)
  })

  it('anual: a mensalidade equivalente, 10 meses em 12', () => {
    expect(monthlyPriceReais('elite', { founder: true, annual: true })).toBe(
      (269 * 10) / 12
    )
  })

  it('último dia: a diferença de poucas horas sai pelo proporcional', () => {
    const cents = pixUpgradeCents({
      currentMonthlyReais: 97,
      newMonthlyReais: 297,
      paidUntil,
      now: new Date(paidUntil.getTime() - 6 * 3_600_000)
    })
    expect(cents).toBe(Math.round(20000 * (6 / (30 * 24))))
  })

  it('abaixo do mínimo do Stripe, já vencido, mesmo preço ou descida: nada', () => {
    const base = { paidUntil, now: daysBefore(10) }
    expect(
      pixUpgradeCents({
        ...base,
        currentMonthlyReais: 97,
        newMonthlyReais: 297,
        now: new Date(paidUntil.getTime() - 60_000)
      })
    ).toBe(0)
    expect(
      pixUpgradeCents({
        ...base,
        currentMonthlyReais: 147,
        newMonthlyReais: 297,
        now: new Date(paidUntil.getTime() + 1)
      })
    ).toBe(0)
    expect(
      pixUpgradeCents({
        ...base,
        currentMonthlyReais: 147,
        newMonthlyReais: 147
      })
    ).toBe(0)
    expect(
      pixUpgradeCents({
        ...base,
        currentMonthlyReais: 297,
        newMonthlyReais: 147
      })
    ).toBe(0)
  })
})
