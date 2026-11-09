import { describe, expect, test } from 'bun:test'
import { paybackClients, readRoutine, recommendPlan } from './pub-routine'

describe('recomendação de plano do cadastro do bar', () => {
  test('até 5 jogos e nada marcado: Starter', () => {
    expect(recommendPlan({ games: 5, spend: 80, wants: [] })).toEqual({
      plan: 'starter',
      reasons: ['Até 5 jogos por mês e sem extras: o Starter dá conta']
    })
  })

  test('mais de 5 jogos pede pelo menos o Pro', () => {
    const { plan, reasons } = recommendPlan({ games: 6, spend: 80, wants: [] })
    expect(plan).toBe('pro')
    expect(reasons).toEqual([
      'Você passa 6 jogos por mês, e o Starter cadastra até 5'
    ])
  })

  test('o maior plano pedido vence, e cada escolha vira um motivo', () => {
    expect(
      recommendPlan({ games: 3, spend: 80, wants: ['quemvai', 'cardapio'] })
    ).toEqual({
      plan: 'elite',
      reasons: [
        'Link do cardápio e preço médio no perfil aparecem a partir do Pro',
        'Saber quem vai assistir, jogo a jogo, só existe no Elite'
      ]
    })
    expect(recommendPlan({ games: 3, spend: 80, wants: ['funil'] }).plan).toBe(
      'pro'
    )
  })

  test('clientes que pagam o plano: arredonda para cima, nunca menos de 1', () => {
    expect(paybackClients(119, 80)).toBe(2)
    expect(paybackClients(269, 80)).toBe(4)
    expect(paybackClients(69, 500)).toBe(1)
    expect(paybackClients(120, 60)).toBe(2)
  })
})

describe('rotina gravada no bar', () => {
  test('a que serve volta, sem escolha repetida', () => {
    expect(
      readRoutine({ games: 8, spend: 60, wants: ['funil', 'funil'] })
    ).toEqual({ games: 8, spend: 60, wants: ['funil'] })
  })

  test('nula, fora dos limites ou com escolha que saiu: nula', () => {
    expect(readRoutine(null)).toBeNull()
    expect(readRoutine({ games: 0, spend: 60, wants: [] })).toBeNull()
    expect(readRoutine({ games: 8, spend: 60, wants: ['reserva'] })).toBeNull()
  })
})
