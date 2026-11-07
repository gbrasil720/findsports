import { describe, expect, test } from 'bun:test'
import type { EventAnalyticsRow } from '@/components/admin/admin-model'
import { sortGames } from './como-cada-jogo'
import { changeText, dailySeries } from './desempenho'
import { markedAgo } from './quem-vai'

const row = (
  eventId: string,
  uniqueVisitors: number,
  interestedPeople: number | null,
  startsAt = '2026-10-01T22:00:00.000Z'
) =>
  ({ eventId, uniqueVisitors, interestedPeople, startsAt }) as EventAnalyticsRow

describe('Desempenho e Quem vai', () => {
  test('ordena os jogos por quem viu, interessados e taxa', () => {
    const rows = [row('a', 10, 1), row('b', 4, 3), row('c', 8, null)]
    expect(sortGames(rows, 'saw').map((r) => r.eventId)).toEqual([
      'a',
      'c',
      'b'
    ])
    expect(sortGames(rows, 'int').map((r) => r.eventId)).toEqual([
      'b',
      'a',
      'c'
    ])
    expect(sortGames(rows, 'rate').map((r) => r.eventId)).toEqual([
      'b',
      'a',
      'c'
    ])
  })

  test('soma WhatsApp, rota e telefone no dia das aberturas', () => {
    expect(
      dailySeries({
        dailyProfileViews: [
          { date: '2026-11-01', value: 5 },
          { date: '2026-11-02', value: 0 }
        ],
        dailyWhatsappOpened: [{ date: '2026-11-01', value: 2 }],
        dailyDirectionsOpened: [{ date: '2026-11-02', value: 1 }],
        dailyPhoneClicked: [{ date: '2026-11-01', value: 1 }]
      })
    ).toEqual([
      { date: '2026-11-01', views: 5, actions: 3 },
      { date: '2026-11-02', views: 0, actions: 1 }
    ])
    // Sem a quebra diária no plano, não há série.
    expect(
      dailySeries({
        dailyProfileViews: null,
        dailyWhatsappOpened: null,
        dailyDirectionsOpened: null,
        dailyPhoneClicked: null
      })
    ).toBeNull()
  })

  test('variação com sinal e sem base', () => {
    expect(changeText(13)).toBe('+13%')
    expect(changeText(-4.25, 'p.p.')).toBe('−4,3 p.p.')
    expect(changeText(null)).toBeNull()
  })

  test('há quanto tempo marcou', () => {
    const now = Date.parse('2026-11-06T21:00:00.000Z')
    expect(markedAgo('2026-11-06T20:20:00.000Z', now)).toBe('marcou há 40 min')
    expect(markedAgo('2026-11-03T21:00:00.000Z', now)).toBe('marcou há 3 dias')
  })
})
