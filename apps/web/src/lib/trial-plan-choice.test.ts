import { describe, expect, test } from 'bun:test'
import { precisaEscolherPlano } from './trial-plan-choice'

const NOW = Date.parse('2026-11-07T12:00:00Z')
const teste = {
  status: 'trialing',
  externalSubscriptionId: null,
  currentPeriodEnd: '2027-02-05T12:00:00Z'
}

describe('guarda do plano do teste', () => {
  test('bar do cadastro novo, no teste, sem escolher: vai à escolha', () => {
    expect(precisaEscolherPlano({ trialPlanChosenAt: null }, teste, NOW)).toBe(
      true
    )
  })

  test('já escolheu (ou é de antes da coluna): abre o painel', () => {
    expect(
      precisaEscolherPlano(
        { trialPlanChosenAt: '2026-11-07T11:00:00Z' },
        teste,
        NOW
      )
    ).toBe(false)
  })

  test('contratou, teste vencido ou sem assinatura: não há o que escolher', () => {
    const semEscolha = { trialPlanChosenAt: null }
    expect(
      precisaEscolherPlano(
        semEscolha,
        { ...teste, externalSubscriptionId: 'sub_1' },
        NOW
      )
    ).toBe(false)
    expect(
      precisaEscolherPlano(
        semEscolha,
        { ...teste, currentPeriodEnd: '2026-11-01T00:00:00Z' },
        NOW
      )
    ).toBe(false)
    expect(
      precisaEscolherPlano(semEscolha, { ...teste, status: 'active' }, NOW)
    ).toBe(false)
    expect(precisaEscolherPlano(semEscolha, null, NOW)).toBe(false)
  })
})
