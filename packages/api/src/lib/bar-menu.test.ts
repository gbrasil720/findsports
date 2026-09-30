import { describe, expect, test } from 'bun:test'
import { AVERAGE_SPEND_MAX_CENTS } from '@findsports_oficial/db/bar-menu'
import {
  assertCanConfigureBarMenu,
  canShowBarMenu,
  parseAverageSpendCentsInput,
  parseMenuUrlInput,
  resolvePublicBarMenu
} from './bar-menu'

const now = new Date('2026-09-29T12:00:00.000Z')
const tomorrow = new Date('2026-09-30T12:00:00.000Z')
const yesterday = new Date('2026-09-28T12:00:00.000Z')

const stored = {
  menuUrl: 'https://bar.com.br/cardapio',
  averageSpendCents: 4550
}

describe('canShowBarMenu', () => {
  test.each(['pro', 'elite'] as const)('%s ativo libera', (plan) => {
    expect(
      canShowBarMenu({ plan, status: 'active', currentPeriodEnd: null }, now)
    ).toBe(true)
  })

  test('trial vigente libera', () => {
    expect(
      canShowBarMenu(
        { plan: 'pro', status: 'trialing', currentPeriodEnd: tomorrow },
        now
      )
    ).toBe(true)
  })

  test('starter ativo não libera', () => {
    expect(
      canShowBarMenu(
        { plan: 'starter', status: 'active', currentPeriodEnd: null },
        now
      )
    ).toBe(false)
  })

  test.each([
    'past_due',
    'inactive',
    'cancelled'
  ] as const)('Elite em %s não libera', (status) => {
    expect(
      canShowBarMenu({ plan: 'elite', status, currentPeriodEnd: tomorrow }, now)
    ).toBe(false)
  })

  test('trial vencido e bar sem assinatura não liberam', () => {
    expect(
      canShowBarMenu(
        { plan: 'elite', status: 'trialing', currentPeriodEnd: yesterday },
        now
      )
    ).toBe(false)
    expect(canShowBarMenu(null, now)).toBe(false)
  })
})

describe('assertCanConfigureBarMenu', () => {
  test('recusa com FORBIDDEN sem plano', () => {
    expect(() => assertCanConfigureBarMenu(null, now)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN' })
    )
  })
})

describe('parse de entrada', () => {
  test('link inválido vira BAD_REQUEST com a mensagem do campo', () => {
    expect(() => parseMenuUrlInput('javascript:alert(1)')).toThrow(
      expect.objectContaining({ code: 'BAD_REQUEST' })
    )
    expect(parseMenuUrlInput('  ')).toBeNull()
    expect(parseMenuUrlInput('bar.com.br')).toBe('https://bar.com.br/')
  })

  test.each([
    0,
    -1,
    10.5,
    AVERAGE_SPEND_MAX_CENTS + 1
  ])('centavos %p viram BAD_REQUEST', (cents) => {
    expect(() => parseAverageSpendCentsInput(cents)).toThrow(
      expect.objectContaining({ code: 'BAD_REQUEST' })
    )
  })

  test('centavos válidos e null passam', () => {
    expect(parseAverageSpendCentsInput(4550)).toBe(4550)
    expect(parseAverageSpendCentsInput(null)).toBeNull()
  })
})

describe('resolvePublicBarMenu', () => {
  test('com plano mostra o que está gravado', () => {
    expect(
      resolvePublicBarMenu(
        stored,
        { plan: 'pro', status: 'active', currentPeriodEnd: null },
        now
      )
    ).toEqual(stored)
  })

  test('sem plano esconde os dois', () => {
    expect(
      resolvePublicBarMenu(
        stored,
        { plan: 'starter', status: 'active', currentPeriodEnd: null },
        now
      )
    ).toEqual({ menuUrl: null, averageSpendCents: null })
  })
})
