import { describe, expect, it } from 'bun:test'
import {
  chaseOf,
  listedInCity,
  monthOf,
  type RankVisit,
  rank,
  scoreOf
} from './ranking'

const at = (iso: string) => new Date(iso)
const v = (
  iso: string,
  barId: string,
  eventId = `${barId}-${iso}`,
  neighborhood = 'Pinheiros'
): RankVisit => ({
  at: at(iso),
  eventId,
  barId,
  barName: barId,
  neighborhood,
  city: 'São Paulo',
  sportId: 'futebol',
  sportName: 'Futebol'
})

// Outubro de 2026 em Brasília (UTC-3): 01/10 03:00Z a 01/11 03:00Z.
const FROM = at('2026-10-01T03:00:00Z')
const TO = at('2026-11-01T03:00:00Z')

describe('scoreOf', () => {
  const visits = [
    v('2026-09-30T23:00:00Z', 'a'), // 20h de 30/09 em Brasília: setembro
    v('2026-10-02T22:00:00Z', 'a'),
    v('2026-10-05T22:00:00Z', 'b', 'jogo-b', 'Lapa'),
    v('2026-10-09T22:00:00Z', 'a'),
    v('2026-11-01T02:30:00Z', 'c') // 23h30 de 31/10 em Brasília: outubro
  ]

  it('conta bares diferentes no mês de Brasília e quando chegou ao número', () => {
    expect(scoreOf('bars', visits, [], FROM, TO)).toEqual({
      value: 3,
      reachedAt: at('2026-11-01T02:30:00Z')
    })
  })

  it('jogos e bairros', () => {
    expect(scoreOf('games', visits, [], FROM, TO).value).toBe(4)
    expect(scoreOf('neighborhoods', visits, [], FROM, TO)).toEqual({
      value: 2,
      reachedAt: at('2026-10-05T22:00:00Z')
    })
  })

  it('conquistas: só as que saíram no mês, com a história de antes', () => {
    // "Primeira rodada" saiu em setembro; "Rodou a cidade" pede 3 bairros.
    const score = scoreOf(
      'achievements',
      [
        v('2026-09-10T22:00:00Z', 'a', 'e1', 'Lapa'),
        v('2026-10-03T22:00:00Z', 'b', 'e2', 'Moema'),
        v('2026-10-04T22:00:00Z', 'c', 'e3', 'Sé')
      ],
      [{ at: at('2026-10-06T12:00:00Z'), barName: 'b' }],
      FROM,
      TO
    )
    expect(score).toEqual({ value: 2, reachedAt: at('2026-10-06T12:00:00Z') })
  })

  it('o mês seguinte começa do zero', () => {
    expect(scoreOf('bars', visits, [], TO, at('2026-12-01T03:00:00Z'))).toEqual(
      { value: 0, reachedAt: null }
    )
  })
})

describe('rank', () => {
  const person = (id: string, value: number, reached: string | null) => ({
    id,
    name: id,
    score: { value, reachedAt: reached ? at(reached) : null }
  })

  it('empate vai para quem chegou primeiro; zero, pelo nome', () => {
    const rows = rank([
      person('Caio', 0, null),
      person('Bia', 3, '2026-10-09T00:00:00Z'),
      person('Ana', 0, null),
      person('Rafa', 3, '2026-10-05T00:00:00Z'),
      person('Marina', 5, '2026-10-20T00:00:00Z')
    ])
    expect(rows.map((r) => [r.position, r.id])).toEqual([
      [1, 'Marina'],
      [2, 'Rafa'],
      [3, 'Bia'],
      [4, 'Ana'],
      [5, 'Caio']
    ])
  })
})

describe('chaseOf', () => {
  const row = (name: string, position: number, value: number, me = false) => ({
    name,
    position,
    me,
    score: { value, reachedAt: null }
  })

  it('falta passar quem está logo acima, e empatar não basta', () => {
    expect(
      chaseOf([row('Marina', 1, 9), row('Você', 2, 7, true), row('Rafa', 3, 6)])
    ).toEqual({ name: 'Marina', need: 3, mine: 7 })
    expect(chaseOf([row('Marina', 1, 7), row('Você', 2, 7, true)])?.need).toBe(
      1
    )
  })

  it('em primeiro, nada', () => {
    expect(chaseOf([row('Você', 1, 2, true), row('Rafa', 2, 1)])).toBeNull()
  })
})

describe('monthOf', () => {
  it('fecha no último dia de Brasília, e vira às 0h de Brasília', () => {
    expect(monthOf(at('2026-10-13T15:00:00Z'))).toEqual({
      month: '2026-10',
      closesInDays: 18
    })
    // 23h de 31/10 em Brasília, já 1º/11 em UTC.
    expect(monthOf(at('2026-11-01T02:00:00Z'))).toEqual({
      month: '2026-10',
      closesInDays: 0
    })
    expect(monthOf(at('2026-11-01T03:00:00Z'))).toEqual({
      month: '2026-11',
      closesInDays: 29
    })
  })
})

describe('listedInCity', () => {
  it('só quem ligou o ranking global e não escolheu "Ninguém"', () => {
    expect(listedInCity(false, 'everyone')).toBe(false)
    expect(listedInCity(true, 'everyone')).toBe(true)
    expect(listedInCity(true, 'friends')).toBe(true)
    expect(listedInCity(true, 'nobody')).toBe(false)
  })
})
