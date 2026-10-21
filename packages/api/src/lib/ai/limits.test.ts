import { describe, expect, it } from 'bun:test'

import {
  assignVariant,
  brasiliaWindows,
  budgetBlock,
  CHAT_DAILY_MESSAGES,
  CHAT_MONTHLY_MESSAGES,
  chatAllowance,
  type UserUsage
} from './limits'
import { costUsd } from './models'
import { readUsage } from './run'

const usage = (over: Partial<UserUsage> = {}): UserUsage => ({
  callsToday: 0,
  chatToday: 0,
  chatMonth: 0,
  userCostMonth: 0,
  totalCostMonth: 0,
  ...over
})

describe('janelas de Brasília (WEB-400)', () => {
  it('23h30 de Brasília ainda é o mesmo dia, já 02h30 em UTC do dia seguinte', () => {
    const w = brasiliaWindows(new Date('2026-10-22T02:30:00Z'))
    expect(w.dayStart.toISOString()).toBe('2026-10-21T03:00:00.000Z')
    expect(w.nextDay.toISOString()).toBe('2026-10-22T03:00:00.000Z')
  })

  it('meia-noite de Brasília vira o dia', () => {
    const w = brasiliaWindows(new Date('2026-10-22T03:00:00Z'))
    expect(w.dayStart.toISOString()).toBe('2026-10-22T03:00:00.000Z')
  })

  it('último dia do mês às 23h59 ainda é o mês; o mês seguinte começa no 1º às 0h', () => {
    const w = brasiliaWindows(new Date('2026-11-01T02:59:00Z'))
    expect(w.monthStart.toISOString()).toBe('2026-10-01T03:00:00.000Z')
    expect(w.nextMonth.toISOString()).toBe('2026-11-01T03:00:00.000Z')
    expect(w.nextDay.toISOString()).toBe('2026-11-01T03:00:00.000Z')
  })

  it('dezembro vira janeiro do ano seguinte', () => {
    const w = brasiliaWindows(new Date('2026-12-31T15:00:00Z'))
    expect(w.nextMonth.toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })
})

describe('limite do chat', () => {
  const now = new Date('2026-10-21T18:00:00Z')

  it('sobra o que falta do dia e do mês', () => {
    expect(chatAllowance(usage({ chatToday: 3, chatMonth: 40 }), now)).toEqual({
      ok: true,
      remainingToday: CHAT_DAILY_MESSAGES - 3,
      remainingMonth: CHAT_MONTHLY_MESSAGES - 40
    })
  })

  it('10 no dia: volta amanhã à meia-noite de Brasília', () => {
    expect(chatAllowance(usage({ chatToday: 10, chatMonth: 10 }), now)).toEqual(
      {
        ok: false,
        scope: 'day',
        resumesAt: new Date('2026-10-22T03:00:00Z')
      }
    )
  })

  it('100 no mês vence o dia: volta no dia 1º', () => {
    expect(chatAllowance(usage({ chatToday: 2, chatMonth: 100 }), now)).toEqual(
      {
        ok: false,
        scope: 'month',
        resumesAt: new Date('2026-11-01T03:00:00Z')
      }
    )
  })

  it('30 chamadas no dia, mesmo sem resposta útil, travam até amanhã', () => {
    const blocked = usage({ callsToday: 30, chatToday: 1 })
    expect(budgetBlock(blocked)).toBe('user_daily')
    expect(chatAllowance(blocked, now)).toMatchObject({
      ok: false,
      scope: 'day'
    })
  })

  it('US$ 1,50 da pessoa trava até o mês que vem; US$ 40 de todo mundo trava todos', () => {
    expect(budgetBlock(usage({ userCostMonth: 1.5 }))).toBe('user_budget')
    expect(chatAllowance(usage({ userCostMonth: 1.5 }), now)).toMatchObject({
      scope: 'month'
    })
    expect(budgetBlock(usage({ totalCostMonth: 40 }))).toBe('budget')
    expect(budgetBlock(usage({ totalCostMonth: 39.99 }))).toBeNull()
  })
})

describe('sorteio do teste', () => {
  const ids = Array.from({ length: 4000 }, (_, i) => `user-${i}`)

  it('a mesma pessoa cai sempre no mesmo braço', () => {
    for (const id of ids.slice(0, 50)) {
      const first = assignVariant(id, 'chat-2026-10', { a: 50, b: 50 })
      expect(assignVariant(id, 'chat-2026-10', { b: 50, a: 50 })).toBe(first)
    }
  })

  it('50/50 divide perto da metade', () => {
    const a = ids.filter(
      (id) => assignVariant(id, 'chat-2026-10', { a: 50, b: 50 }) === 'a'
    ).length
    expect(a / ids.length).toBeGreaterThan(0.46)
    expect(a / ids.length).toBeLessThan(0.54)
  })

  it('peso zero tira o braço; tudo zero cai no primeiro', () => {
    expect(
      ids.every((id) => assignVariant(id, 'x', { a: 0, b: 100 }) === 'b')
    ).toBe(true)
    expect(assignVariant('u', 'x', { a: 0, b: 0 })).toBe('a')
  })

  it('outro teste sorteia de novo, independente', () => {
    const same = ids.filter(
      (id) =>
        assignVariant(id, 'chat', { a: 50, b: 50 }) ===
        assignVariant(id, 'recommender', { a: 50, b: 50 })
    ).length
    expect(same / ids.length).toBeGreaterThan(0.4)
    expect(same / ids.length).toBeLessThan(0.6)
  })
})

describe('custo', () => {
  it('preço por milhão de tokens; modelo da Cloudflare por neurons', () => {
    expect(
      costUsd('openai/gpt-6-luna', {
        tokensIn: 1_000_000,
        tokensOut: 1_000_000
      })
    ).toBeCloseTo(0.6)
    expect(
      costUsd('@cf/exemplo/modelo-por-neurons', {
        tokensIn: 150,
        tokensOut: 62,
        neurons: 1000
      })
    ).toBeCloseTo(0.011)
  })
})

describe('tokens da resposta', () => {
  it('Gemini: raciocínio fora do completion_tokens entra na saída', () => {
    expect(
      readUsage({
        usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 23 }
      })
    ).toEqual({ tokensIn: 4, tokensOut: 19, neurons: undefined })
  })

  it('Jev traz o uso dentro de result', () => {
    expect(
      readUsage({ result: { usage: { input_tokens: 274, output_tokens: 20 } } })
    ).toMatchObject({ tokensIn: 274, tokensOut: 20 })
  })
})
