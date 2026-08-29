import { describe, expect, it } from 'bun:test'

import { buildBarFacts } from './bar-facts'
import type { ProfileEvent } from './pub-profile'

const NOW = new Date('2026-08-19T12:00:00.000Z')

function makeEvent(overrides: Partial<ProfileEvent> = {}): ProfileEvent {
  return {
    id: crypto.randomUUID(),
    championship: 'Brasileirão',
    startsAt: new Date(NOW.getTime() + 3_600_000),
    endsAt: null,
    participantFreeText: null,
    sport: { name: 'Futebol', slug: 'futebol' },
    participants: [],
    ...overrides
  }
}

describe('buildBarFacts', () => {
  it('sem agenda e sem cadastro, não inventa fato', () => {
    expect(
      buildBarFacts({ events: [], createdAt: null, rating: null, now: NOW })
    ).toEqual([])
  })

  it('põe a nota como primeiro fato, quando o servidor mandou uma', () => {
    const facts = buildBarFacts({
      events: [],
      createdAt: null,
      rating: { positive: 7, total: 10, percentage: 70 },
      now: NOW
    })

    expect(facts[0]).toEqual({
      key: 'rating',
      label: 'Voltariam pra ver jogo',
      value: '70% de 10'
    })
  })

  it('não inventa nota quando o servidor mandou null', () => {
    const facts = buildBarFacts({
      events: [makeEvent()],
      createdAt: null,
      rating: null,
      now: NOW
    })

    expect(facts.some((fact) => fact.key === 'rating')).toBe(false)
  })

  it('lista os esportes sem repetir', () => {
    const facts = buildBarFacts({
      events: [
        makeEvent(),
        makeEvent(),
        makeEvent({ sport: { name: 'Basquete', slug: 'basquete' } })
      ],
      createdAt: null,
      rating: null,
      now: NOW
    })

    expect(facts.find((fact) => fact.key === 'sports')?.value).toBe(
      'Futebol e Basquete'
    )
  })

  it('ordena campeonatos por frequência e corta em dois', () => {
    const facts = buildBarFacts({
      events: [
        makeEvent({ championship: 'Copa do Brasil' }),
        makeEvent({ championship: 'Brasileirão' }),
        makeEvent({ championship: 'Brasileirão' }),
        makeEvent({ championship: 'Libertadores' })
      ],
      createdAt: null,
      rating: null,
      now: NOW
    })

    expect(facts.find((fact) => fact.key === 'championships')?.value).toBe(
      'Brasileirão e Copa do Brasil'
    )
  })

  it('deduplica campeonato por caixa mas exibe a grafia do bar', () => {
    const facts = buildBarFacts({
      events: [
        makeEvent({ championship: 'Brasileirão' }),
        makeEvent({ championship: 'BRASILEIRÃO' })
      ],
      createdAt: null,
      rating: null,
      now: NOW
    })

    expect(facts.find((fact) => fact.key === 'championships')?.value).toBe(
      'Brasileirão'
    )
  })

  it('conta só os jogos dentro da semana', () => {
    const facts = buildBarFacts({
      events: [
        makeEvent({ startsAt: new Date(NOW.getTime() + 3_600_000) }),
        makeEvent({ startsAt: new Date(NOW.getTime() + 6 * 86_400_000) }),
        makeEvent({ startsAt: new Date(NOW.getTime() + 20 * 86_400_000) })
      ],
      createdAt: null,
      rating: null,
      now: NOW
    })

    expect(facts.find((fact) => fact.key === 'week')?.value).toBe('2 jogos')
  })

  it('singulariza um jogo só', () => {
    const facts = buildBarFacts({
      events: [makeEvent()],
      createdAt: null,
      rating: null,
      now: NOW
    })

    expect(facts.find((fact) => fact.key === 'week')?.value).toBe('1 jogo')
  })

  it('omite a contagem quando não há jogo na semana', () => {
    const facts = buildBarFacts({
      events: [
        makeEvent({ startsAt: new Date(NOW.getTime() + 30 * 86_400_000) })
      ],
      createdAt: null,
      rating: null,
      now: NOW
    })

    expect(facts.some((fact) => fact.key === 'week')).toBe(false)
  })

  it('formata o tempo de casa e aceita string do tRPC', () => {
    const facts = buildBarFacts({
      events: [],
      createdAt: '2026-03-04T00:00:00.000Z',
      rating: null,
      now: NOW
    })

    expect(facts.find((fact) => fact.key === 'since')?.value).toBe('mar/2026')
  })

  it('ignora data de cadastro inválida em vez de exibir NaN', () => {
    const facts = buildBarFacts({
      events: [],
      createdAt: 'nada disso',
      rating: null,
      now: NOW
    })

    expect(facts.some((fact) => fact.key === 'since')).toBe(false)
  })
})
