import { describe, expect, test } from 'bun:test'
import {
  fold,
  highlight,
  hoods,
  liveNow,
  matchQuery,
  type NearBar,
  rememberSearch,
  sides,
  tonight
} from './search'

// 20/10/2026, 20:00 em Brasília.
const NOW = Date.parse('2026-10-20T23:00:00Z')
const HOUR = 3_600_000

const game = (text: string, offsetHours: number) => ({
  startsAt: new Date(NOW + offsetHours * HOUR).toISOString(),
  endsAt: null,
  championship: 'Brasileirão',
  participants: [],
  participantFreeText: text,
  sport: { name: 'Futebol', slug: 'futebol' }
})

const bar = (
  id: string,
  hood: string,
  km: number,
  next?: ReturnType<typeof game>
): NearBar => ({
  id,
  name: `Bar ${id}`,
  neighborhood: hood,
  latitude: 0,
  longitude: 0,
  photo_url: null,
  distance_km: km,
  nextEvent: next
})

const CORI = game('Corinthians × Palmeiras', -1)
const GRE = game('Grêmio × Internacional', 1.5)
const BARS = [
  bar('a', 'Pinheiros', 2, CORI),
  bar('b', 'Pinheiros', 0.8, CORI),
  bar('c', 'Vila Madalena', 1, GRE),
  bar('d', 'Pinheiros', 3, game('Lakers × Celtics', 26))
]

describe('busca (19a, 19b)', () => {
  test('jogo ao vivo agrupa os bares, do mais perto', () => {
    const live = liveNow(BARS, NOW)
    expect(live?.bars.map((b) => b.id)).toEqual(['b', 'a'])
    expect(sides(live?.game ?? CORI)).toEqual(['Corinthians', 'Palmeiras'])
  })

  test('hoje à noite: só o que não começou e é hoje', () => {
    expect(tonight(BARS, NOW).map((g) => g.bars.map((b) => b.id))).toEqual([
      ['c']
    ])
  })

  test('bairros pela quantidade, com quantos ao vivo', () => {
    const [first] = hoods(BARS, NOW)
    expect(first).toMatchObject({ name: 'Pinheiros', live: 2 })
    expect(first?.bars).toHaveLength(3)
  })

  test('digitando: bairro sem acento e jogo por qualquer palavra', () => {
    expect(matchQuery(BARS, 'pinh', NOW).hood?.name).toBe('Pinheiros')
    expect(matchQuery(BARS, 'gremio', NOW).bars.map((b) => b.id)).toEqual(['c'])
    expect(matchQuery(BARS, '  ', NOW).bars).toEqual([])
  })

  test('marca-texto e recentes', () => {
    expect(highlight('Pinheiros', 'pinh')).toEqual([
      { text: 'Pinh', hit: true },
      { text: 'eiros', hit: false }
    ])
    expect(highlight('Grêmio', 'gre')[0]).toEqual({ text: 'Grê', hit: true })
    expect(rememberSearch(['Lakers', 'Bar do Zé'], 'lakers ')).toEqual([
      'lakers',
      'Bar do Zé'
    ])
    expect(fold(' Área ')).toBe('area')
  })
})
