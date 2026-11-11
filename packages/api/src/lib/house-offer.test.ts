import { describe, expect, test } from 'bun:test'
import { HOUSE_OFFER_MAX_LENGTH } from '@findsports_oficial/db/house-offer'
import { TRPCError } from '@trpc/server'
import {
  assertCanConfigureHouseOffer,
  effectiveHouseOffer,
  gameHouseOfferFromForm,
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

describe('effectiveHouseOffer', () => {
  const herda = { houseOffer: null, noHouseOffer: false }

  test('sem nada no jogo, vale a do bar', () => {
    expect(effectiveHouseOffer('Chopp em dobro', herda)).toBe('Chopp em dobro')
    expect(effectiveHouseOffer(null, herda)).toBeNull()
  })

  test('a do jogo substitui a do bar', () => {
    const jogo = { houseOffer: 'Porção grátis', noHouseOffer: false }
    expect(effectiveHouseOffer('Chopp em dobro', jogo)).toBe('Porção grátis')
    expect(effectiveHouseOffer(null, jogo)).toBe('Porção grátis')
  })

  test('"sem oferta neste jogo" desliga a do bar só ali', () => {
    const jogo = { houseOffer: null, noHouseOffer: true }
    expect(effectiveHouseOffer('Chopp em dobro', jogo)).toBeNull()
  })
})

describe('gameHouseOfferFromForm', () => {
  test('ligada com o texto da padrão herda, mesmo com espaços', () => {
    expect(
      gameHouseOfferFromForm('Chopp em dobro', {
        ligada: true,
        texto: '  Chopp  em dobro '
      })
    ).toEqual({ houseOffer: null, noHouseOffer: false })
  })

  test('ligada com outro texto grava a do jogo, normalizada', () => {
    expect(
      gameHouseOfferFromForm('Chopp em dobro', {
        ligada: true,
        texto: 'Porção  grátis'
      })
    ).toEqual({ houseOffer: 'Porção grátis', noHouseOffer: false })
    expect(
      gameHouseOfferFromForm(null, { ligada: true, texto: 'Porção grátis' })
    ).toEqual({ houseOffer: 'Porção grátis', noHouseOffer: false })
  })

  test('desligada ou em branco é "sem oferta neste jogo"', () => {
    const sem = { houseOffer: null, noHouseOffer: true }
    expect(
      gameHouseOfferFromForm('Chopp', { ligada: false, texto: 'Porção' })
    ).toEqual(sem)
    expect(
      gameHouseOfferFromForm('Chopp', { ligada: true, texto: '  ' })
    ).toEqual(sem)
  })

  test('sem padrão, desligada herda: abrir e salvar não muda o jogo', () => {
    expect(gameHouseOfferFromForm(null, { ligada: false, texto: '' })).toEqual({
      houseOffer: null,
      noHouseOffer: false
    })
  })
})
