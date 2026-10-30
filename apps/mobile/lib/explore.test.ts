/// <reference types="bun-types" />
import { expect, test } from 'bun:test'
import {
  coverBars,
  coverKicker,
  distanceKm,
  formatKm,
  formatTime,
  goingSummary,
  greeting,
  isLive,
  matchPeriod,
  searchCenter,
  teamMark
} from './explore'

test('busca parte do aparelho, senão da cidade, senão de São Paulo', () => {
  const city = { lat: -22.9, lng: -43.2, name: 'Rio de Janeiro' }
  expect(searchCenter({ lat: 1, lng: 2 }, city)).toEqual({ lat: 1, lng: 2 })
  expect(searchCenter(null, city)).toEqual({ lat: -22.9, lng: -43.2 })
  expect(searchCenter(null, null)).toEqual({ lat: -23.5329, lng: -46.6395 })
})

test('ao vivo do início ao fim; sem fim informado, três horas', () => {
  const startsAt = '2026-10-15T22:00:00Z'
  const at = (iso: string) => new Date(iso).getTime()
  expect(isLive({ startsAt, endsAt: null }, at('2026-10-15T21:59:00Z'))).toBe(
    false
  )
  expect(isLive({ startsAt, endsAt: null }, at('2026-10-16T00:59:00Z'))).toBe(
    true
  )
  expect(isLive({ startsAt, endsAt: null }, at('2026-10-16T01:01:00Z'))).toBe(
    false
  )
  const endsAt = '2026-10-15T23:00:00Z'
  expect(isLive({ startsAt, endsAt }, at('2026-10-15T23:30:00Z'))).toBe(false)
})

test('textos como o design escreve', () => {
  expect(formatKm(0.8)).toBe('0,8 km')
  expect(formatKm(1.43)).toBe('1,4 km')
  expect(formatKm(12.4)).toBe('12,4 km')
  expect(formatTime('2026-10-16T00:30:00Z')).toBe('21:30')
  expect(teamMark('Corinthians')).toBe('COR')
  expect(teamMark('Grêmio')).toBe('GRÊ')
  expect(greeting(new Date('2026-10-16T00:30:00Z'))).toBe('Boa noite')
  expect(greeting(new Date('2026-10-16T13:00:00Z'))).toBe('Bom dia')
})

test('distância de um quarteirão a outro', () => {
  const km = distanceKm(
    { lat: -23.5505, lng: -46.6333 },
    { lat: -23.5613, lng: -46.6565 }
  )
  expect(km).toBeGreaterThan(2.6)
  expect(km).toBeLessThan(2.8)
})

test('quem vai: contagem, amigos pelo primeiro nome e a pilha', () => {
  const friends = (...names: string[]) => names.map((name) => ({ name }))
  expect(
    goingSummary({
      count: 34,
      initials: ['J', 'K', 'L'],
      friends: friends('Marina Costa', 'Rafael Lima')
    })
  ).toEqual({
    faces: ['M', 'R'],
    more: 32,
    lead: '34 pessoas vão',
    tail: ', entre elas Marina e Rafael'
  })
  expect(
    goingSummary({ count: 20, initials: ['J', 'K', 'L'], friends: [] })
  ).toEqual({ faces: ['J', 'K'], more: 18, lead: '20 pessoas vão', tail: '' })
  // Abaixo do piso: só os amigos, sem número.
  expect(
    goingSummary({ count: null, initials: [], friends: friends('Marina') })
  ).toEqual({ faces: ['M'], more: 0, lead: 'Marina vai', tail: '' })
  expect(
    goingSummary({
      count: null,
      initials: [],
      friends: friends('Ana', 'Bia', 'Caio', 'Duda')
    }).lead
  ).toBe('Ana, Bia e mais 2 amigos vão')
  expect(
    goingSummary({
      count: 16,
      initials: [],
      friends: friends('Ana', 'Bia', 'Caio')
    }).tail
  ).toBe(', entre elas Ana, Bia e Caio')
  // Nome que começa com emoji: o primeiro nome é a primeira palavra com letra.
  expect(
    goingSummary({ count: null, initials: [], friends: friends('🦁 Leo Dias') })
  ).toMatchObject({ faces: ['L'], lead: 'Leo vai' })
})

test('tela de fora do Flip: só bares com jogo, do mais perto, até cinco', () => {
  const bar = (id: string, km: number, game = true) => ({
    id,
    distance_km: km,
    nextEvent: game ? {} : undefined
  })
  const bars = [bar('a', 2), bar('b', 0.8), bar('c', 0.5, false), bar('d', 1)]
  expect(coverBars(bars).map((b) => b.id)).toEqual(['b', 'd', 'a'])
  const many = Array.from({ length: 8 }, (_, i) => bar(String(i), 8 - i))
  expect(coverBars(many).map((b) => b.id)).toEqual(['7', '6', '5', '4', '3'])
})

test('tela de fora do Flip: o jogo em siglas, ao vivo ou com a hora', () => {
  const game = {
    startsAt: '2026-10-15T22:00:00Z',
    endsAt: null,
    championship: 'Brasileirão',
    participantFreeText: null,
    participants: [
      { team: { name: 'Corinthians' } },
      { team: { name: 'Palmeiras' } }
    ]
  }
  const at = (iso: string) => new Date(iso).getTime()
  expect(coverKicker(game, at('2026-10-15T23:00:00Z'))).toBe(
    'COR × PAL · AO VIVO'
  )
  const futebol = { ...game, sport: { slug: 'futebol' } }
  expect(coverKicker(futebol, at('2026-10-15T23:10:00Z'))).toBe(
    'COR × PAL · 2º TEMPO'
  )
  expect(coverKicker(game, at('2026-10-15T20:00:00Z'))).toBe(
    'COR × PAL · 19:00'
  )
  expect(
    coverKicker(
      { ...game, participants: [], participantFreeText: 'GP de Interlagos' },
      at('2026-10-15T20:00:00Z')
    )
  ).toBe('GP DE INTERLAGOS · 19:00')
})

test('parte do jogo de futebol pelo relógio', () => {
  const game = {
    startsAt: '2026-10-15T22:00:00Z',
    endsAt: null,
    sport: { slug: 'futebol' }
  }
  const at = (min: number) => Date.parse(game.startsAt) + min * 60_000
  expect(matchPeriod(game, at(-5))).toBeNull()
  expect(matchPeriod(game, at(30))).toBe('1º tempo')
  expect(matchPeriod(game, at(50))).toBe('Intervalo')
  expect(matchPeriod(game, at(80))).toBe('2º tempo')
  expect(matchPeriod(game, at(130))).toBe('Ao vivo')
  expect(matchPeriod({ ...game, sport: { slug: 'basquete' } }, at(30))).toBe(
    'Ao vivo'
  )
})
