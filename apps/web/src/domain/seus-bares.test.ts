import { expect, test } from 'bun:test'
import { maisVisitados, visitasDoAno } from './seus-bares'

const v = (startsAt: string, barId: string, neighborhood = 'Pinheiros') => ({
  startsAt,
  barId,
  neighborhood
})

test('visitas do ano pelo dia de Brasília, em bares, bairros e meses', () => {
  const r = visitasDoAno(
    [
      v('2026-10-05T22:00:00Z', 'a'),
      v('2026-10-12T22:00:00Z', 'a'),
      v('2026-11-01T01:00:00Z', 'b', 'Vila Madalena'), // 31/10 em Brasília
      v('2027-01-01T05:00:00Z', 'c')
    ],
    2026
  )
  expect(r).toMatchObject({ jogos: 3, bares: 2, bairros: 2, pico: 3 })
  expect(r.meses[9]).toEqual(['out', 3])
})

test('mais visitados primeiro', () => {
  const lista = maisVisitados([v('x', 'a'), v('x', 'b'), v('x', 'b')])
  expect(lista.map((l) => [l.visita.barId, l.n])).toEqual([
    ['b', 2],
    ['a', 1]
  ])
})
