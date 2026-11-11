import { describe, expect, test } from 'bun:test'
import {
  barHistory,
  brasiliaSlot,
  type CatalogCandidate,
  rankCatalogGames,
  reasonFor
} from './rank'

const game = (
  id: string,
  startsAt: string,
  extra: Partial<CatalogCandidate> = {}
): CatalogCandidate => ({
  id,
  sportId: 'futebol',
  championship: 'Premier League',
  title: id,
  startsAt: new Date(startsAt),
  homeTeamId: null,
  awayTeamId: null,
  channels: [],
  channelConfirmed: false,
  fans: 0,
  barsInNeighborhood: 0,
  ...extra
})

// Quartas às 21:30 de Brasília (00:30 UTC de quinta).
const wednesdays = ['2026-10-22T00:30:00Z', '2026-10-29T00:30:00Z'].map(
  (at) => ({
    sportId: 'futebol',
    championship: 'Brasileirão Série A',
    startsAt: new Date(at),
    teams: [{ id: 'fla', name: 'Flamengo' }]
  })
)

describe('sugestões do catálogo: ordem e motivo', () => {
  test('dia e hora de Brasília, não UTC', () => {
    expect(brasiliaSlot(new Date('2026-11-19T00:30:00Z'))).toEqual({
      weekday: 3,
      hour: 21
    })
  })

  test('time e campeonato do histórico vêm antes; o primeiro é o destaque', () => {
    const history = barHistory(wednesdays)
    const ranked = rankCatalogGames(
      history,
      [
        game('Sem nada', '2026-11-15T15:00:00Z', { sportId: 'outro' }),
        game('Campeonato', '2026-11-16T15:00:00Z', {
          championship: 'brasileirao serie a'
        }),
        game('Time', '2026-11-17T15:00:00Z', {
          championship: 'Copa do Brasil',
          homeTeamId: 'fla',
          awayTeamId: 'pal'
        })
      ],
      2
    )
    expect(ranked.map((g) => [g.title, g.featured])).toEqual([
      ['Time', true],
      ['Campeonato', false]
    ])
    expect(ranked[0]?.reason).toBe('Você já passou 2 jogos do Flamengo')
    expect(ranked[1]?.reason).toBe('Você costuma passar brasileirao serie a')
  })

  test('time da casa vem antes do histórico e vira "Seu time"', () => {
    const history = barHistory(wednesdays, new Map([['pal', 'Palmeiras']]))
    const [first, second] = rankCatalogGames(
      history,
      [
        game('Do histórico', '2026-11-15T15:00:00Z', { homeTeamId: 'fla' }),
        game('Da casa', '2026-11-16T15:00:00Z', {
          homeTeamId: 'sao',
          awayTeamId: 'pal',
          barsInNeighborhood: 2
        })
      ],
      2
    )
    expect(first?.title).toBe('Da casa')
    expect(first?.houseTeam).toBe('Palmeiras')
    expect(first?.reason).toBe('Do Palmeiras, que você marcou')
    expect(second?.houseTeam).toBeNull()
    expect(
      reasonFor(
        history,
        game('Sozinho', '2026-11-17T15:00:00Z', { awayTeamId: 'pal' })
      )
    ).toBe('Do Palmeiras, que você marcou, e ninguém do bairro passa ainda')
  })

  test('torcedores abaixo de 10 não saem', () => {
    const history = barHistory([])
    const [many, few] = rankCatalogGames(
      history,
      [
        game('Poucos', '2026-11-15T15:00:00Z', { fans: 9 }),
        game('Muitos', '2026-11-15T16:00:00Z', { fans: 120 })
      ],
      5
    ).sort((a, b) => a.title.localeCompare(b.title))
    expect(many?.fansInCity).toBe(120)
    expect(few?.fansInCity).toBeNull()
  })

  test('bairro cheio pesa contra; vazio vira motivo', () => {
    const history = barHistory([])
    const [first] = rankCatalogGames(
      history,
      [
        game('Concorrido', '2026-11-15T15:00:00Z', { barsInNeighborhood: 3 }),
        game('Sozinho', '2026-11-15T16:00:00Z')
      ],
      2
    )
    expect(first?.title).toBe('Sozinho')
    expect(first?.reason).toBe('Seria o único do bairro')
  })

  test('dia e hora em que o bar costuma ter jogo', () => {
    const history = barHistory(
      wednesdays.map((w) => ({ ...w, championship: 'Outro', teams: [] }))
    )
    expect(
      reasonFor(
        history,
        game('Quarta', '2026-11-19T00:00:00Z', { barsInNeighborhood: 2 })
      )
    ).toBe('Seu bar costuma ter jogo às quartas por volta das 21h')
    expect(
      reasonFor(
        history,
        game('Domingo', '2026-11-15T15:00:00Z', { barsInNeighborhood: 2 })
      )
    ).toBeNull()
  })
})
