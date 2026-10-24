import { describe, expect, it } from 'bun:test'
import { gameTitle } from '@findsports_oficial/db/game-title'
import {
  formatDayLabel,
  formatEventTime,
  formatGameSubtitle,
  getBarInitials,
  getPlanPresentation,
  groupEventsByDay,
  type NormalizedPub,
  type ProfileEvent,
  resolveHeroEvent,
  resolveProfileActions
} from './pub-profile'

const NOW = new Date('2026-08-19T20:00:00.000Z')
const HOUR = 60 * 60 * 1000

function makeEvent(overrides: Partial<ProfileEvent> = {}): ProfileEvent {
  return {
    id: 'evt-1',
    championship: 'Brasileirão',
    startsAt: new Date(NOW.getTime() + HOUR),
    endsAt: null,
    participantFreeText: null,
    sport: { name: 'Futebol', slug: 'futebol' },
    participants: [],
    ...overrides
  }
}

describe('resolveHeroEvent', () => {
  it('destaca o jogo pelo qual o torcedor chegou', () => {
    const wanted = makeEvent({
      id: 'evt-2',
      startsAt: new Date(NOW.getTime() + 5 * HOUR)
    })
    const events = [makeEvent(), wanted]

    expect(resolveHeroEvent(events, 'evt-2', NOW)?.id).toBe('evt-2')
  })

  it('destaca jogo ao vivo mesmo que já tenha começado', () => {
    const live = makeEvent({
      id: 'evt-live',
      startsAt: new Date(NOW.getTime() - 30 * 60 * 1000)
    })

    expect(resolveHeroEvent([live], 'evt-live', NOW)?.id).toBe('evt-live')
  })

  it('cai para o próximo jogo quando o eventId não existe mais', () => {
    const events = [
      makeEvent({ id: 'a', startsAt: new Date(NOW.getTime() + 3 * HOUR) }),
      makeEvent({ id: 'b', startsAt: new Date(NOW.getTime() + HOUR) })
    ]

    expect(resolveHeroEvent(events, 'sumiu', NOW)?.id).toBe('b')
  })

  it('usa o próximo jogo quando não há eventId', () => {
    const events = [
      makeEvent({ id: 'a', startsAt: new Date(NOW.getTime() + 3 * HOUR) }),
      makeEvent({ id: 'b', startsAt: new Date(NOW.getTime() + HOUR) })
    ]

    expect(resolveHeroEvent(events, null, NOW)?.id).toBe('b')
  })

  it('devolve null quando o bar não tem jogo nenhum', () => {
    expect(resolveHeroEvent([], 'evt-1', NOW)).toBeNull()
  })

  it('ignora jogo já encerrado ao escolher sozinho', () => {
    const past = makeEvent({
      id: 'velho',
      startsAt: new Date(NOW.getTime() - 5 * HOUR)
    })

    expect(resolveHeroEvent([past], null, NOW)).toBeNull()
  })

  it('respeita o fim informado ao escolher o destaque', () => {
    const stillLive = makeEvent({
      id: 'longo',
      startsAt: new Date(NOW.getTime() - 4 * HOUR),
      endsAt: new Date(NOW.getTime() + HOUR)
    })
    const alreadyOver = makeEvent({
      id: 'curto',
      startsAt: new Date(NOW.getTime() - HOUR),
      endsAt: new Date(NOW.getTime() - 1)
    })

    expect(resolveHeroEvent([alreadyOver, stillLive], null, NOW)?.id).toBe(
      'longo'
    )
  })
})

describe('formatGameSubtitle', () => {
  it('mostra o campeonato quando o título são os times', () => {
    expect(
      formatGameSubtitle('Palmeiras × Santos', ['Futebol', 'Brasileirão'])
    ).toBe('Futebol · Brasileirão')
  })

  it('não repete o campeonato que já é o título (WEB-307)', () => {
    const event = makeEvent()
    expect(
      formatGameSubtitle(gameTitle(event), ['Futebol', event.championship])
    ).toBe('Futebol')
    expect(formatGameSubtitle('Brasileirão', ['Brasileirão'])).toBe('')
  })
})

describe('formatDayLabel', () => {
  const base = new Date('2026-08-19T12:00:00-03:00')

  it('chama o dia corrente de Hoje', () => {
    expect(formatDayLabel(new Date('2026-08-19T20:00:00-03:00'), base)).toBe(
      'Hoje'
    )
  })

  it('chama o dia seguinte de Amanhã', () => {
    expect(formatDayLabel(new Date('2026-08-20T09:00:00-03:00'), base)).toBe(
      'Amanhã'
    )
  })

  it('escreve a data para os demais dias', () => {
    const date = new Date('2026-08-26T16:00:00-03:00')
    expect(formatDayLabel(date, base)).toBe('quarta-feira, 26 de ago.')
    expect(formatDayLabel(date, base, 'short')).toBe('qua., 26 de ago.')
  })

  // 22:30 em Brasília já é dia 20 em UTC: o rótulo segue o bar, não o navegador.
  it('conta o dia no relógio de Brasília, não no do navegador', () => {
    const late = new Date('2026-08-19T22:30:00-03:00')
    expect(formatDayLabel(late, base)).toBe('Hoje')
    expect(formatDayLabel(new Date('2026-08-20T23:30:00-03:00'), base)).toBe(
      'Amanhã'
    )
    expect(
      formatDayLabel(new Date('2026-08-26T22:30:00-03:00'), base, 'short')
    ).toBe('qua., 26 de ago.')
    // Às 23:00 de Brasília ainda é hoje, mesmo com o UTC já no dia seguinte.
    expect(formatDayLabel(late, new Date('2026-08-19T23:00:00-03:00'))).toBe(
      'Hoje'
    )
  })
})

describe('formatEventTime', () => {
  it('mostra a hora de Brasília', () => {
    expect(formatEventTime(new Date('2026-08-19T22:30:00-03:00'))).toBe('22:30')
    expect(formatEventTime(new Date('2026-08-19T09:05:00-03:00'))).toBe('09:05')
  })
})

describe('groupEventsByDay', () => {
  it('agrupa por dia e ordena por horário dentro do dia', () => {
    const base = new Date('2026-08-19T12:00:00-03:00')
    const events = [
      makeEvent({
        id: 'noite',
        startsAt: new Date('2026-08-19T22:30:00-03:00')
      }),
      makeEvent({
        id: 'amanha',
        startsAt: new Date('2026-08-20T16:00:00-03:00')
      }),
      makeEvent({ id: 'cedo', startsAt: new Date('2026-08-19T16:00:00-03:00') })
    ]

    const groups = groupEventsByDay(events, base)

    expect(groups.map((group) => group.label)).toEqual(['Hoje', 'Amanhã'])
    expect(groups[0]?.events.map((event) => event.id)).toEqual([
      'cedo',
      'noite'
    ])
  })

  it('devolve lista vazia sem jogos', () => {
    expect(groupEventsByDay([], NOW)).toEqual([])
  })
})

describe('getPlanPresentation', () => {
  it('expõe o selo do plano e a altura correta para cada plano', () => {
    expect(getPlanPresentation('starter')).toMatchObject({
      planBadge: null,
      coverHeight: 'h-[150px] md:h-[180px]'
    })

    expect(getPlanPresentation('pro')).toMatchObject({
      planBadge: { label: 'Pro' },
      coverHeight: 'h-[300px] md:h-[360px]'
    })

    expect(getPlanPresentation('elite')).toMatchObject({
      planBadge: { label: 'Elite' },
      coverHeight: 'h-[300px] md:h-[360px]'
    })
  })

  it('não dá selo a plano ausente, e ainda assim entrega capa', () => {
    const starter = getPlanPresentation('starter')
    expect(starter.planBadge).toBeNull()
    expect(starter.coverHeight.length).toBeGreaterThan(0)
  })

  it('trata plano ausente ou desconhecido como starter', () => {
    expect(getPlanPresentation(null).planBadge).toBeNull()
    expect(getPlanPresentation('lendario').planBadge).toBeNull()
  })
})

describe('getBarInitials', () => {
  it('usa as duas primeiras palavras', () => {
    expect(getBarInitials('Pastel do Theo')).toBe('PD')
  })

  it('aguenta nome de uma palavra só', () => {
    expect(getBarInitials('Boteco')).toBe('B')
  })
})

describe('resolveProfileActions', () => {
  const pub = {
    name: 'Bar',
    phone: '+5511999999999',
    phoneAcceptsWhatsapp: true,
    latitude: '-23.56',
    longitude: '-46.68',
    address: 'Rua 1',
    events: []
  } as unknown as NormalizedPub

  it('monta WhatsApp, rota e telefone, sem reserva de mesa', () => {
    const actions = resolveProfileActions(pub, null)
    expect(Object.keys(actions).sort()).toEqual([
      'directionsUrl',
      'phone',
      'whatsappUrl'
    ])
    expect(actions.whatsappUrl).toContain('wa.me')
    expect(actions.phone).toBe('+5511999999999')
  })
})
