import { describe, expect, test } from 'bun:test'
import { buildNotices, noticeSections, noticeTime, startsIn } from './notices'
import { sides } from './search'

// 20/10/2026, 12:00 em Brasília.
const NOW = Date.parse('2026-10-20T15:00:00Z')
const HOUR = 3_600_000
const iso = (h: number) => new Date(NOW + h * HOUR).toISOString()

const bar = (id: string, startsAt: string) => ({
  id,
  name: id,
  neighborhood: 'Pinheiros',
  latitude: 0,
  longitude: 0,
  photo_url: null,
  distance_km: 1,
  nextEvent: {
    startsAt,
    endsAt: null,
    championship: 'Brasileirão',
    participants: [],
    participantFreeText: 'Grêmio × Internacional',
    sport: { name: 'Futebol', slug: 'futebol' }
  }
})

describe('avisos (19c)', () => {
  const notices = buildNotices(
    {
      mine: [
        // Validado ontem com oferta: aviso.
        {
          eventId: 'e1',
          barName: 'Boteco Sete',
          startsAt: iso(-24),
          offer: 'Chopp',
          validated: true
        },
        // Não validado: nada.
        {
          eventId: 'e2',
          barName: 'Casa 92',
          startsAt: iso(-2),
          offer: 'Chopp',
          validated: false
        },
        // Validado há 40 dias: velho demais.
        {
          eventId: 'e3',
          barName: 'X',
          startsAt: iso(-40 * 24),
          offer: 'Chopp',
          validated: true
        }
      ],
      medals: [
        { id: 'bar5', unlockedAt: iso(-1) },
        { id: 'bar10', unlockedAt: null }
      ],
      // O mesmo jogo em dois bares perto vira um aviso só.
      teamBars: [bar('a', iso(9)), bar('b', iso(9)), bar('c', iso(-3))],
      sides
    },
    NOW
  )

  test('monta oferta, conquista e jogo, sem repetir nem velho', () => {
    expect(notices.map((n) => n.id).sort()).toEqual([
      `game:Grêmio × Internacional|${iso(9)}`,
      'medal:bar5',
      'offer:e1'
    ])
    const game = notices.find((n) => n.kind === 'game')
    expect(game).toMatchObject({ bars: 2, sides: ['Grêmio', 'Internacional'] })
  })

  test('seções por dia e hora do aviso', () => {
    expect(
      noticeSections(notices, NOW).map((s) => [s.title, s.items.length])
    ).toEqual([
      ['Hoje', 2],
      ['Esta semana', 1]
    ])
    expect(noticeTime(iso(-1), NOW)).toBe('11:00')
    expect(noticeTime(iso(-24), NOW)).toBe('SEG')
    expect(noticeTime(iso(-10 * 24), NOW)).toBe('10 OUT')
    expect(startsIn(iso(2.47), NOW)).toBe('2h28')
    expect(startsIn(iso(0.2), NOW)).toBe('12 min')
    expect(startsIn(iso(-1), NOW)).toBeNull()
  })
})
