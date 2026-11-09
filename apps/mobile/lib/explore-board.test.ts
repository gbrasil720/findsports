/// <reference types="bun-types" />
import { expect, test } from 'bun:test'
import {
  type BoardBar,
  type BoardGame,
  barCount,
  barsOfGame,
  chosenGame,
  distance,
  gameRow,
  type QuietBar,
  quietBars
} from './explore-board'

const bar = (barId: string, km: number, extra: Partial<BoardBar> = {}) =>
  ({
    barId,
    distanceKm: km,
    elite: false,
    classic: null,
    amenities: [],
    ...extra
  }) as BoardBar

const game = (
  key: string,
  startsAt: string,
  bars: BoardBar[],
  slug = 'futebol'
) =>
  ({
    key,
    startsAt,
    endsAt: null,
    sport: { slug, name: slug },
    bars
  }) as unknown as BoardGame

const at = (iso: string) => new Date(iso).getTime()

test('fileira: sem os que acabaram, ao vivo primeiro, depois pela hora', () => {
  const games = [
    game('tarde', '2026-11-09T22:00:00Z', []),
    game('acabou', '2026-11-09T12:00:00Z', []),
    game('agora', '2026-11-09T20:00:00Z', []),
    game('nba', '2026-11-09T21:00:00Z', [], 'basquete')
  ]
  const now = at('2026-11-09T20:30:00Z')
  expect(gameRow(games, null, now).map((g) => [g.key, g.live])).toEqual([
    ['agora', true],
    ['nba', false],
    ['tarde', false]
  ])
  expect(gameRow(games, 'basquete', now).map((g) => g.key)).toEqual(['nba'])
})

test('jogo escolhido, senão o primeiro da fileira', () => {
  const row = gameRow(
    [
      game('a', '2026-11-09T22:00:00Z', []),
      game('b', '2026-11-09T23:00:00Z', [])
    ],
    null,
    at('2026-11-09T10:00:00Z')
  )
  expect(chosenGame(row, 'b')?.key).toBe('b')
  expect(chosenGame(row, 'sumiu')?.key).toBe('a')
  expect(chosenGame([], 'a')).toBeUndefined()
})

test('bares do jogo: características, Elite do clássico na frente, perto', () => {
  const [g] = gameRow(
    [
      game('a', '2026-11-09T22:00:00Z', [
        bar('longe', 3, { amenities: [1] }),
        bar('perto', 0.4, { amenities: [1] }),
        bar('classico', 2, {
          amenities: [1],
          elite: true,
          classic: { reason: 'r', ruleVersion: 1 }
        }),
        bar('sem-telao', 0.1)
      ])
    ],
    null,
    at('2026-11-09T10:00:00Z')
  )
  expect(barsOfGame(g, [1]).map((b) => b.barId)).toEqual([
    'classico',
    'perto',
    'longe'
  ])
  expect(barsOfGame(undefined, [])).toEqual([])
  expect(barCount(g ? [g, g] : [], [1])).toBe(3)
})

test('sem jogo: tira os que passam o jogo e segue as características', () => {
  const quiet = [
    { barId: 'x', distanceKm: 2, amenities: [1] },
    { barId: 'y', distanceKm: 1, amenities: [1] },
    { barId: 'z', distanceKm: 0.5, amenities: [] }
  ] as QuietBar[]
  expect(quietBars(quiet, [1], [bar('x', 2)]).map((b) => b.barId)).toEqual([
    'y'
  ])
})

test('distância como o web', () => {
  expect(distance(0.45)).toBe('450 m')
  expect(distance(0.001)).toBe('10 m')
  expect(distance(1.25)).toBe('1,3 km')
})
