import { describe, expect, test } from 'bun:test'
import {
  axisLine,
  chips,
  distanceText,
  freshCount,
  gameWhen,
  heaviestAxis,
  nextRoundLabel,
  type Round,
  reasonLine,
  roundSummary,
  type Suggestion,
  sportWord,
  stripLabel,
  usualLine
} from './suggestions'

// 21/10/2026, 15:00 em Brasília (quarta).
const NOW = new Date('2026-10-21T18:00:00Z').getTime()

function item(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    barId: 'b1',
    name: 'Casa 92',
    neighborhood: 'Pinheiros',
    photoUrl: null,
    latitude: '-23.56',
    longitude: '-46.69',
    distanceKm: 1.4,
    position: 1,
    slot: 'sua_cara',
    score: 86.2,
    axes: {
      directIntent: 24,
      sportsAffinity: 20,
      distance: 13,
      experienceSimilarity: 14,
      quality: 15
    },
    reason: 'recent_interest',
    isExpandedRadius: false,
    facts: {
      gameOpensWeek: 2,
      viewsWeek: 0,
      highIntent: false,
      ratedPositive: false,
      sport: 'Futebol',
      team: 'Grêmio',
      shared: [1, 4],
      references: [
        { name: 'Bar do Zé', visits: 4 },
        { name: 'Pirajá', visits: 1 }
      ],
      rating: { percentage: 92, total: 48 },
      usualSports: [
        { id: 's1', name: 'Futebol' },
        { id: 's2', name: 'F1' }
      ]
    },
    decision: null,
    seen: false,
    game: null,
    alerts: { sportIds: [], teamIds: [] },
    ...overrides
  } as Suggestion
}

const round = (items: Suggestion[]): Round =>
  ({
    runId: 'r',
    day: '2026-10-21',
    nextRoundAt: '2026-10-22T13:00:00.000Z',
    radiusKm: 5,
    items
  }) as Round

describe('frases do card (tabela da 22e)', () => {
  test('interesse recente conta as aberturas do jogo', () => {
    expect(reasonLine(item())).toBe(
      'Você abriu o jogo dele duas vezes esta semana'
    )
    expect(
      reasonLine(item({ facts: { ...item().facts, gameOpensWeek: 1 } }))
    ).toBe('Você abriu o jogo dele esta semana')
  })

  test('parecido usa o bar de referência e as visitas', () => {
    expect(reasonLine(item({ reason: 'similar_experience' }))).toBe(
      'Parecido com o Bar do Zé, onde você foi quatro vezes'
    )
    const noVisits = item({
      reason: 'similar_experience',
      facts: { ...item().facts, references: [{ name: 'Pirajá', visits: 0 }] }
    })
    expect(reasonLine(noVisits)).toBe(
      'Telão e área externa, como os bares que você mais curte'
    )
  })

  test('sem número, a frase não inventa', () => {
    const plain = item({
      reason: 'well_rated',
      facts: { ...item().facts, rating: null }
    })
    expect(reasonLine(plain)).toBe('Bem avaliado por quem foi assistir')
    expect(reasonLine(item({ reason: 'preferred_sport' }))).toBe(
      'Passa futebol, que você acompanha'
    )
    expect(reasonLine(item({ reason: 'nearby', distanceKm: 0.62 }))).toBe(
      'A 600 m de você'
    )
  })
})

describe('22c', () => {
  test('cada eixo com a frase e os pontos', () => {
    const it = item()
    expect(axisLine(it, 'directIntent', 5)).toBe(
      'Você abriu o jogo do Casa 92 duas vezes nos últimos 7 dias.'
    )
    expect(axisLine(it, 'sportsAffinity', 5)).toBe(
      'Passa futebol, que você acompanha, e o Grêmio, que você viu.'
    )
    expect(axisLine(it, 'distance', 5)).toBe(
      'A 1,4 km, dentro do seu raio de 5 km.'
    )
    expect(axisLine(it, 'experienceSimilarity', 5)).toBe(
      'Telão e área externa, como o Bar do Zé e o Pirajá, onde você mais vai.'
    )
    expect(axisLine(it, 'quality', 5)).toBe(
      '92% dos torcedores voltariam, em 48 avaliações.'
    )
    expect(heaviestAxis(it)).toBe('directIntent')
  })

  test('fora do raio', () => {
    expect(axisLine(item({ distanceKm: 6.2 }), 'distance', 5)).toBe(
      'A 6,2 km, um pouco além do seu raio de 5 km.'
    )
  })

  test('fichas: os outros eixos fortes, sem repetir o motivo', () => {
    expect(chips(item()).map((axis) => axis.label)).toEqual([
      'Seu esporte',
      'Avaliação'
    ])
  })
})

describe('jogo, rodada e resumo', () => {
  test('hora do jogo como no design', () => {
    expect(gameWhen('2026-10-22T00:30:00Z', NOW)).toBe('HOJE 21:30')
    expect(gameWhen('2026-10-24T19:00:00Z', NOW)).toBe('SÁB 16:00')
  })

  test('bar sem jogo diz o que costuma passar', () => {
    expect(usualLine(item())).toBe('Costuma passar futebol e F1')
    expect(sportWord('MMA')).toBe('MMA')
    expect(distanceText(4.1)).toBe('4,1 km')
  })

  test('próxima rodada às 10:00', () => {
    expect(nextRoundLabel('2026-10-22T13:00:00.000Z', NOW)).toBe(
      'Nova rodada amanhã, 10:00'
    )
    // 02:00 de Brasília: a rodada nova é hoje.
    expect(
      nextRoundLabel(
        '2026-10-22T13:00:00.000Z',
        new Date('2026-10-22T05:00:00Z').getTime()
      )
    ).toBe('Nova rodada hoje, 10:00')
  })

  test('resumo da rodada fechada (23f)', () => {
    const today = {
      id: 'e',
      startsAt: '2026-10-22T00:30:00.000Z',
      attending: true
    } as Suggestion['game']
    const r = round([
      item({ decision: 'liked', game: today }),
      item({ barId: 'b2', decision: 'passed' }),
      item({ barId: 'b3', decision: 'liked' }),
      item({ barId: 'b4', decision: 'liked' }),
      item({ barId: 'b5', decision: 'passed' })
    ])
    expect(roundSummary(r, NOW)).toBe(
      'Três bares curtidos, um com jogo hoje, e dois que você passou. As próximas sugestões já levam isso em conta.'
    )
    expect(stripLabel(r.items[0] as Suggestion, NOW)).toBe('VOU')
    expect(stripLabel(r.items[1] as Suggestion, NOW)).toBe('PASSEI')
  })

  test('"N novos" conta só os que a pessoa não viu', () => {
    expect(
      freshCount(
        round([
          item(),
          item({ barId: 'b2', seen: true }),
          item({ barId: 'b3', decision: 'liked' })
        ])
      )
    ).toBe(1)
  })
})
