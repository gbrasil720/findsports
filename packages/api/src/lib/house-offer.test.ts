import { describe, expect, test } from 'bun:test'
import { HOUSE_OFFER_MAX_LENGTH } from '@findsports_oficial/db/house-offer'
import { TRPCError } from '@trpc/server'
import {
  assertCanConfigureHouseOffer,
  canConfigureHouseOffer,
  parseHouseOfferInput,
  resolvePublicHouseOffer
} from './house-offer'

const now = new Date('2026-09-13T12:00:00.000Z')
const tomorrow = new Date('2026-09-14T12:00:00.000Z')
const yesterday = new Date('2026-09-12T12:00:00.000Z')

describe('canConfigureHouseOffer', () => {
  test('Elite ativo configura', () => {
    expect(
      canConfigureHouseOffer(
        { plan: 'elite', status: 'active', currentPeriodEnd: null },
        now
      )
    ).toBe(true)
  })

  test('Elite em trial vigente configura', () => {
    expect(
      canConfigureHouseOffer(
        { plan: 'elite', status: 'trialing', currentPeriodEnd: tomorrow },
        now
      )
    ).toBe(true)
  })

  test.each(['starter', 'pro'] as const)('%s ativo não configura', (plan) => {
    expect(
      canConfigureHouseOffer(
        { plan, status: 'active', currentPeriodEnd: null },
        now
      )
    ).toBe(false)
  })

  test.each([
    'past_due',
    'inactive',
    'cancelled'
  ] as const)('Elite em %s não configura', (status) => {
    expect(
      canConfigureHouseOffer(
        { plan: 'elite', status, currentPeriodEnd: tomorrow },
        now
      )
    ).toBe(false)
  })

  test('trial Elite vencido não configura', () => {
    expect(
      canConfigureHouseOffer(
        { plan: 'elite', status: 'trialing', currentPeriodEnd: yesterday },
        now
      )
    ).toBe(false)
  })

  test('bar sem assinatura não configura', () => {
    expect(canConfigureHouseOffer(null, now)).toBe(false)
  })
})

describe('assertCanConfigureHouseOffer', () => {
  test('recusa com FORBIDDEN', () => {
    try {
      assertCanConfigureHouseOffer(
        { plan: 'pro', status: 'active', currentPeriodEnd: null },
        now
      )
      throw new Error('deveria ter recusado')
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      expect((error as TRPCError).code).toBe('FORBIDDEN')
    }
  })
})

describe('parseHouseOfferInput', () => {
  test('grava a forma normalizada', () => {
    expect(parseHouseOfferInput('  Porção  grátis ')).toBe('Porção grátis')
  })

  test('texto em branco limpa a oferta', () => {
    expect(parseHouseOfferInput('   ')).toBeNull()
    expect(parseHouseOfferInput(null)).toBeNull()
  })

  test('aceita exatamente o limite', () => {
    const noLimite = 'a'.repeat(HOUSE_OFFER_MAX_LENGTH)
    expect(parseHouseOfferInput(noLimite)).toBe(noLimite)
  })

  test('mede o limite depois de normalizar', () => {
    const comEspacos = `   ${'a'.repeat(HOUSE_OFFER_MAX_LENGTH)}   `
    expect(parseHouseOfferInput(comEspacos)).toHaveLength(
      HOUSE_OFFER_MAX_LENGTH
    )
  })

  test('recusa acima do limite com BAD_REQUEST', () => {
    try {
      parseHouseOfferInput('a'.repeat(HOUSE_OFFER_MAX_LENGTH + 1))
      throw new Error('deveria ter recusado')
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError)
      expect((error as TRPCError).code).toBe('BAD_REQUEST')
    }
  })
})

describe('resolvePublicHouseOffer', () => {
  const elite = {
    plan: 'elite' as const,
    status: 'active' as const,
    currentPeriodEnd: null
  }

  test('mostra a oferta de bar Elite', () => {
    expect(resolvePublicHouseOffer('Chopp em dobro', elite, now)).toBe(
      'Chopp em dobro'
    )
  })

  test('bar sem oferta não mostra nada', () => {
    expect(resolvePublicHouseOffer(null, elite, now)).toBeNull()
  })

  test('downgrade esconde a oferta', () => {
    expect(
      resolvePublicHouseOffer(
        'Chopp em dobro',
        { plan: 'pro', status: 'active', currentPeriodEnd: null },
        now
      )
    ).toBeNull()
  })
})
