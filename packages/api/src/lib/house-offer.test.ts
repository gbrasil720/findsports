import { describe, expect, test } from 'bun:test'
import { HOUSE_OFFER_MAX_LENGTH } from '@findsports_oficial/db/house-offer'
import { TRPCError } from '@trpc/server'
import {
  assertCanConfigureHouseOffer,
  parseHouseOfferInput
} from './house-offer'

const now = new Date('2026-09-13T12:00:00.000Z')

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
