import { describe, expect, it } from 'bun:test'
import {
  formatDayLabel,
  formatMatchup,
  getBarInitials,
  getPlanPresentation,
  groupEventsByDay,
  type ProfileEvent,
  resolveHeroEvent
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
})

describe('formatMatchup', () => {
  it('usa os times quando existem', () => {
    const event = makeEvent({
      participants: [
        { team: { name: 'Palmeiras', logoUrl: null } },
        { team: { name: 'Santos', logoUrl: null } }
      ],
      participantFreeText: 'ignorado'
    })

    expect(formatMatchup(event)).toBe('Palmeiras × Santos')
  })

  it('cai para o texto livre do bar', () => {
    const event = makeEvent({ participantFreeText: 'Clássico paulista' })
    expect(formatMatchup(event)).toBe('Clássico paulista')
  })

  it('cai para o campeonato quando não há mais nada', () => {
    expect(formatMatchup(makeEvent())).toBe('Brasileirão')
  })
})

describe('formatDayLabel', () => {
  const base = new Date('2026-08-19T12:00:00')

  it('chama o dia corrente de Hoje', () => {
    expect(formatDayLabel(new Date('2026-08-19T23:00:00'), base)).toBe('Hoje')
  })

  it('chama o dia seguinte de Amanhã', () => {
    expect(formatDayLabel(new Date('2026-08-20T09:00:00'), base)).toBe('Amanhã')
  })

  it('escreve a data para os demais dias', () => {
    const label = formatDayLabel(new Date('2026-08-25T09:00:00'), base)
    expect(label).not.toBe('Hoje')
    expect(label).not.toBe('Amanhã')
    expect(label.length).toBeGreaterThan(0)
  })
})

describe('groupEventsByDay', () => {
  it('agrupa por dia e ordena por horário dentro do dia', () => {
    const base = new Date('2026-08-19T12:00:00')
    const events = [
      makeEvent({ id: 'tarde', startsAt: new Date('2026-08-19T21:00:00') }),
      makeEvent({ id: 'amanha', startsAt: new Date('2026-08-20T16:00:00') }),
      makeEvent({ id: 'cedo', startsAt: new Date('2026-08-19T16:00:00') })
    ]

    const groups = groupEventsByDay(events, base)

    expect(groups.map((group) => group.label)).toEqual(['Hoje', 'Amanhã'])
    expect(groups[0]?.events.map((event) => event.id)).toEqual([
      'cedo',
      'tarde'
    ])
  })

  it('devolve lista vazia sem jogos', () => {
    expect(groupEventsByDay([], NOW)).toEqual([])
  })
})

describe('getPlanPresentation', () => {
  it('dá selo a pro e elite', () => {
    expect(getPlanPresentation('pro').badge?.label).toBe('Pro')
    expect(getPlanPresentation('elite').badge?.label).toBe('Elite')
  })

  it('não dá selo ao starter, e ainda assim entrega capa', () => {
    const starter = getPlanPresentation('starter')
    expect(starter.badge).toBeNull()
    expect(starter.coverHeight.length).toBeGreaterThan(0)
  })

  it('trata plano ausente ou desconhecido como starter', () => {
    expect(getPlanPresentation(null).badge).toBeNull()
    expect(getPlanPresentation('lendario').badge).toBeNull()
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
