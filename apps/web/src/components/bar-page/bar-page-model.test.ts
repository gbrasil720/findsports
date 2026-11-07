import { describe, expect, test } from 'bun:test'
import type { PublicGame } from '@findsports_oficial/api/lib/public-bar-page'
import {
  barJsonLd,
  barPageDescription,
  barPageTitle,
  barSocial,
  brasiliaIso,
  dayLabel,
  gameState,
  goingText,
  type PageBar,
  pickGame
} from './bar-page-model'

/** Sábado, 07/11/2026, 19:40 em Brasília. */
const NOW = new Date('2026-11-07T22:40:00Z')
const at = (iso: string) => new Date(`${iso}-03:00`)

const game = (fields: Partial<PublicGame>): PublicGame => ({
  id: crypto.randomUUID(),
  startsAt: at('2026-11-07T21:30:00'),
  endsAt: null,
  title: 'Flamengo × Palmeiras',
  championship: 'Brasileirão',
  sport: 'Futebol',
  teams: ['Flamengo', 'Palmeiras'],
  onBigScreen: true,
  withSound: true,
  houseOffer: null,
  going: null,
  attendanceEnabled: true,
  ...fields
})

const LIVE = game({
  id: 'live',
  startsAt: at('2026-11-07T19:00:00'),
  title: 'Corinthians × Bahia',
  going: 21
})
const LATER = game({ id: 'later' })
const SUNDAY = game({
  id: 'sunday',
  startsAt: at('2026-11-08T16:00:00'),
  title: 'São Paulo × Grêmio'
})
const ENDED = game({ id: 'ended', startsAt: at('2026-11-07T12:00:00') })

const bar = (events: PublicGame[], extra: Partial<PageBar> = {}): PageBar => ({
  id: 'b0b0b0b0-0000-4000-8000-000000000e01',
  name: 'Bar do Zé',
  description: 'Boteco de esquina.',
  address: 'Rua Mourato Coelho, 1080',
  neighborhood: 'Vila Madalena',
  city: 'São Paulo',
  uf: 'SP',
  latitude: '-23.55680000',
  longitude: '-46.68780000',
  phone: '(11) 3031-4521',
  photoUrl: 'https://media.onside.sh/ze.webp',
  screenCount: 3,
  amenities: [1, 2, 4],
  rating: null,
  openingHours: null,
  opening: null,
  events,
  ...extra
})

describe('relógio do jogo', () => {
  test('ao vivo, por vir e acabado, pelo fim derivado de 3 h', () => {
    expect(gameState(LIVE, NOW)).toBe('live')
    expect(gameState(LATER, NOW)).toBe('upcoming')
    expect(gameState(ENDED, NOW)).toBe('ended')
  })
  test('rótulo do dia em Brasília', () => {
    expect(dayLabel(LATER.startsAt, NOW)).toBe('hoje')
    expect(dayLabel(SUNDAY.startsAt, NOW)).toBe('amanhã')
    expect(dayLabel(at('2026-11-10T22:00:00'), NOW)).toBe('ter 10/11')
    // 23h30 de sábado em Brasília já é domingo em UTC: continua "hoje".
    expect(dayLabel(at('2026-11-07T23:30:00'), NOW)).toBe('hoje')
  })
  test('o cartão abre no jogo pedido, senão no primeiro que não acabou', () => {
    const events = [ENDED, LIVE, LATER]
    expect(pickGame(events, 'later', NOW)?.id).toBe('later')
    expect(pickGame(events, 'ended', NOW)?.id).toBe('live')
    expect(pickGame(events, undefined, NOW)?.id).toBe('live')
    expect(pickGame([ENDED], undefined, NOW)).toBeNull()
  })
})

describe('quem vai', () => {
  test('contagem sem amigo', () => {
    expect(goingText(21, [])).toEqual({
      count: 21,
      text: 'pessoas vão assistir aqui'
    })
  })
  test('amigos pelo primeiro nome, até dois', () => {
    expect(
      goingText(34, [
        { name: 'Marina Costa' },
        { name: 'Rafael Lima' },
        { name: 'João' }
      ])
    ).toEqual({ count: 34, text: 'pessoas vão, entre elas Marina e Rafael' })
  })
  test('abaixo do piso, só o amigo', () => {
    expect(goingText(null, [{ name: 'Marina Costa' }])).toEqual({
      count: null,
      text: 'Marina vai assistir aqui'
    })
    expect(goingText(null, [])).toBeNull()
  })
})

describe('título e descrição', () => {
  test('com jogo hoje, o jogo na frente e a marca no fim', () => {
    const page = bar([ENDED, LIVE, LATER, SUNDAY])
    expect(barPageTitle(page, NOW)).toBe(
      'Onde assistir Corinthians × Bahia hoje: Bar do Zé, Vila Madalena — Onside'
    )
    expect(barPageDescription(page, NOW)).toBe(
      'Hoje no Bar do Zé: Corinthians × Bahia ao vivo, Flamengo × Palmeiras às 21:30. 3 telões, som do jogo, área externa em Vila Madalena, São Paulo.'
    )
  })
  test('sem jogo hoje, o próximo', () => {
    const page = bar([SUNDAY])
    expect(barPageTitle(page, NOW)).toBe(
      'Bar do Zé, Vila Madalena: jogos no telão — Onside'
    )
    expect(barPageDescription(page, NOW)).toStartWith(
      'Próximo jogo no Bar do Zé: São Paulo × Grêmio, amanhã às 16:00.'
    )
  })
  test('cabe em 158 e larga o horário primeiro', () => {
    const page = bar([LIVE, LATER], {
      opening: { open: true, closes: '02:00', opens: null, today: 'sáb' }
    })
    const text = barPageDescription(page, NOW)
    expect(text.length).toBeLessThanOrEqual(158)
    expect(text.endsWith('…')).toBe(false)
    expect(
      barPageDescription(bar([SUNDAY], { opening: page.opening }), NOW)
    ).toContain('Aberto até 02:00.')
  })
  test('cartão do WhatsApp', () => {
    expect(barSocial(bar([LIVE]), NOW)).toEqual({
      title: 'Bar do Zé · Vila Madalena',
      description:
        'Ao vivo agora: Corinthians × Bahia no telão. 21 pessoas vão.'
    })
    expect(barSocial(bar([LATER]), NOW).description).toBe(
      'Hoje 21:30: Flamengo × Palmeiras no telão.'
    )
  })
})

describe('JSON-LD', () => {
  const URL = 'https://www.onside.sh/bar/bar-do-ze-vila-madalena-b0b0b0b0'
  test('o bar e um Event por jogo que não acabou', () => {
    const data = barJsonLd(bar([ENDED, LIVE, LATER]), URL, NOW)
    const [place, ...events] = data['@graph'] as Record<string, unknown>[]
    expect(place?.['@type']).toBe('BarOrPub')
    expect(place?.aggregateRating).toBeUndefined()
    expect(events.map((e) => e.name)).toEqual([
      'Corinthians × Bahia no Bar do Zé',
      'Flamengo × Palmeiras no Bar do Zé'
    ])
    expect(events[1]?.startDate).toBe('2026-11-07T21:30:00-03:00')
    expect(events[1]?.endDate).toBe('2026-11-08T00:30:00-03:00')
  })
  test('nota só quando a página a mostra', () => {
    const data = barJsonLd(
      bar([], { rating: { total: 38, percentage: 92 } }),
      URL,
      NOW
    )
    expect(
      (data['@graph'][0] as Record<string, unknown>).aggregateRating
    ).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 92,
      bestRating: 100,
      worstRating: 0,
      ratingCount: 38
    })
  })
  test('ISO no fuso de Brasília', () => {
    expect(brasiliaIso(at('2026-11-07T23:30:00'))).toBe(
      '2026-11-07T23:30:00-03:00'
    )
  })
})
