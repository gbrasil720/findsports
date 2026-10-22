import { describe, expect, test } from 'bun:test'
import {
  buildNotices,
  callLine,
  inTab,
  noticeSections,
  noticeTime,
  startsIn,
  todayGoing
} from './notices'
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

describe('avisos de amigos (19c)', () => {
  const person = (id: string, at: string) => ({
    id,
    name: `Pessoa ${id}`,
    at,
    mutual: 3,
    mutualInitials: ['MC', 'PO', 'LA']
  })
  const notices = buildNotices(
    {
      mine: [],
      medals: [{ id: 'bar5', unlockedAt: iso(-1) }],
      teamBars: [],
      sides,
      friends: {
        // Pedido recebido não vence.
        requests: [person('julia', iso(-60 * 24))],
        // Aceito há mais de 30 dias sai.
        accepted: [person('rafa', iso(-2)), person('velho', iso(-31 * 24))]
      }
    },
    NOW
  )

  test('pedido recebido e aceito, nas abas do design', () => {
    expect(notices.map((n) => n.id)).toEqual([
      'medal:bar5',
      'friend-accepted:rafa',
      'friend-request:julia'
    ])
    expect(
      notices.filter((n) => inTab(n, 'friends')).map((n) => n.kind)
    ).toEqual(['friend-accepted', 'friend-request'])
    expect(notices.filter((n) => inTab(n, 'games'))).toEqual([])
    expect(notices.filter((n) => inTab(n, 'all'))).toHaveLength(3)
  })

  test('o rodapé do jogo de hoje', () => {
    const friends = (...names: string[]) => names.map((name) => ({ name }))
    expect(
      todayGoing({
        count: 34,
        initials: ['J'],
        friends: friends('Marina Costa', 'Rafael Lima')
      })
    ).toEqual({
      faces: ['MC', 'RL'],
      more: 32,
      bold: 'Marina',
      rest: ' e mais 33 vão'
    })
    expect(todayGoing(null)).toEqual({
      faces: [],
      more: 0,
      bold: '',
      rest: 'Você vai'
    })
    expect(
      todayGoing({ count: 20, initials: ['A', 'B'], friends: [] })
    ).toEqual({ faces: ['A', 'B'], more: 18, bold: '', rest: '20 pessoas vão' })
    expect(
      todayGoing({ count: null, initials: [], friends: friends('Ana', 'Bia') })
    ).toMatchObject({ bold: 'Ana', rest: ' e Bia vão', more: 0 })
  })
})

describe('Avisar e Lembrar (WEB-425)', () => {
  const NOW_ = new Date('2026-10-21T18:00:00Z').getTime()
  const game = {
    eventId: 'e1',
    barId: 'b1',
    barName: 'Bar Original',
    startsAt: '2026-10-24T19:00:00.000Z',
    championship: 'Brasileirão',
    participants: ['Palmeiras', 'São Paulo'],
    participantFreeText: null
  }
  const base = { mine: [], medals: [], teamBars: [], sides: () => null }

  test('jogo publicado pelo bar avisado vira aviso', () => {
    const [notice] = buildNotices(
      {
        ...base,
        alerts: [{ ...game, publishedAt: '2026-10-21T15:00:00.000Z' }]
      },
      NOW_
    )
    expect(notice).toMatchObject({
      kind: 'alert',
      title: 'Palmeiras × São Paulo',
      barName: 'Bar Original'
    })
  })

  test('lembrete só no dia do jogo', () => {
    expect(buildNotices({ ...base, reminders: [game] }, NOW_)).toHaveLength(0)
    const today = { ...game, startsAt: '2026-10-22T00:30:00.000Z' }
    expect(buildNotices({ ...base, reminders: [today] }, NOW_)[0]?.kind).toBe(
      'reminder'
    )
  })

  test('lembrete de 3 h antes só aparece na janela', () => {
    const at = new Date(NOW_ + 4 * 3_600_000).toISOString()
    const early = { ...game, startsAt: at, remindBeforeMinutes: 180 }
    expect(buildNotices({ ...base, reminders: [early] }, NOW_)).toHaveLength(0)
    const soon = {
      ...early,
      startsAt: new Date(NOW_ + 2 * 3_600_000).toISOString()
    }
    expect(buildNotices({ ...base, reminders: [soon] }, NOW_)[0]?.kind).toBe(
      'reminder'
    )
  })
})

describe('chamado de amigo (Rodada 24)', () => {
  const call = (id: string, startsAt: string, at = iso(-1)) => ({
    id,
    status: 'pending' as const,
    at,
    person: { id: 'gabriel', name: 'Gabriel Brasil', image: null },
    eventId: `e-${id}`,
    barId: 'ze',
    barName: 'Bar do Zé',
    startsAt,
    championship: 'Brasileirão',
    participants: ['Corinthians', 'Palmeiras'],
    participantFreeText: null
  })

  test('recebido e aceito ficam na aba Amigos', () => {
    const notices = buildNotices(
      {
        mine: [],
        medals: [],
        teamBars: [],
        sides,
        friends: {
          requests: [],
          accepted: [],
          calls: [call('a', iso(9.5))],
          callsAccepted: [call('b', iso(9.5), iso(-2))]
        }
      },
      NOW
    )
    expect(notices.map((n) => n.id)).toEqual(['call:a', 'call-accepted:b'])
    expect(notices.every((n) => inTab(n, 'friends'))).toBe(true)
    expect(notices.some((n) => inTab(n, 'games'))).toBe(false)
  })

  test('a linha do jogo diz o dia', () => {
    // 21:30 de hoje em Brasília.
    expect(callLine(call('a', iso(9.5)), NOW)).toBe(
      'Corinthians × Palmeiras · Bar do Zé · hoje 21:30'
    )
    expect(callLine(call('a', iso(33.5)), NOW)).toBe(
      'Corinthians × Palmeiras · Bar do Zé · amanhã 21:30'
    )
    expect(callLine(call('a', iso(81.5)), NOW)).toBe(
      'Corinthians × Palmeiras · Bar do Zé · sex 21:30'
    )
  })
})
