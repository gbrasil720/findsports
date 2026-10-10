import { describe, expect, test } from 'bun:test'

import { getShownPlan, isStarterSubscription } from './lapsed-plan'

// WEB-344: o card da Visão geral e o "Plano: …" do Desempenho saem daqui.
describe('getShownPlan', () => {
  test('plano em dia é o "Plano atual", sem nota', () => {
    expect(getShownPlan({ plan: 'pro', standing: 'current' })).toEqual({
      name: 'Pro',
      label: 'Plano atual',
      note: null
    })
  })

  test('trial vencido segue com o plano gravado e diz que o trial acabou', () => {
    expect(getShownPlan({ plan: 'elite', standing: 'trial_ended' })).toEqual({
      name: 'Elite',
      label: 'Trial encerrado',
      note: 'Trial do plano Elite encerrado'
    })
  })

  test('pagamento pendente usa o mesmo texto de `LAPSED_COPY`', () => {
    expect(getShownPlan({ plan: 'pro', standing: 'past_due' })).toEqual({
      name: 'Pro',
      label: 'Pagamento pendente',
      note: 'Plano Pro com pagamento pendente'
    })
  })

  test('assinatura encerrada não é "Plano atual"', () => {
    expect(getShownPlan({ plan: 'starter', standing: 'ended' })).toEqual({
      name: 'Starter',
      label: 'Assinatura encerrada',
      note: 'Assinatura do plano Starter encerrada'
    })
  })

  test('sem assinatura não há plano: o Starter de `bar.plan` é só o default', () => {
    const none = {
      name: 'Sem plano',
      label: 'Escolher um plano',
      note: 'Nenhuma assinatura ativa'
    }
    expect(getShownPlan(null)).toEqual(none)
    expect(getShownPlan(undefined)).toEqual(none)
  })
})

// Aviso de limite da Visão geral: quem não assinou não lê texto do Starter.
describe('isStarterSubscription', () => {
  test('assinatura no Starter, em dia ou parada, lê o aviso do Starter', () => {
    expect(
      isStarterSubscription({ plan: 'starter', standing: 'current' })
    ).toBe(true)
    expect(
      isStarterSubscription({ plan: 'starter', standing: 'past_due' })
    ).toBe(true)
  })

  test('sem assinatura não é Starter, como no card "Sem plano"', () => {
    for (const none of [null, undefined, { plan: 'starter', standing: null }]) {
      expect(isStarterSubscription(none as never)).toBe(false)
      expect(getShownPlan(none as never).name).toBe('Sem plano')
    }
  })

  test('Pro e Elite não leem o aviso do Starter', () => {
    expect(isStarterSubscription({ plan: 'pro', standing: 'current' })).toBe(
      false
    )
    expect(
      isStarterSubscription({ plan: 'elite', standing: 'trial_ended' })
    ).toBe(false)
  })
})
