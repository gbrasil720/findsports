import { expect, test } from 'bun:test'
import { toChatBar } from './chat-tools'

const now = new Date('2026-10-24T12:00:00Z')
const barWith = (game: {
  participants: { team: { name: string; logoUrl: null } }[]
  participantFreeText: string | null
}) =>
  ({
    id: 'bar',
    name: 'Bar do Zé',
    neighborhood: 'Pinheiros',
    distance_km: 1,
    photo_url: null,
    plan: 'pro',
    rating: null,
    averageSpendCents: null,
    nextEvent: {
      id: 'jogo',
      championship: 'Brasileirão',
      startsAt: '2026-10-24T22:00:00.000Z',
      endsAt: null,
      ...game
    }
  }) as unknown as Parameters<typeof toChatBar>[0]

const team = (name: string) => ({ team: { name, logoUrl: null } })

test('o card do chat dá o título do jogo pela regra de todas as telas', () => {
  // Três pilotos não são confronto: o texto livre (antes, o chat o usava
  // mesmo vazio, e o card saía sem título).
  expect(
    toChatBar(
      barWith({
        participants: [team('Norris'), team('Piastri'), team('Leclerc')],
        participantFreeText: 'GP de São Paulo'
      }),
      now
    ).game?.title
  ).toBe('GP de São Paulo')
  // Texto livre vazio: antes o título saía vazio, no lugar do campeonato.
  expect(
    toChatBar(barWith({ participants: [], participantFreeText: '' }), now).game
      ?.title
  ).toBe('Brasileirão')
  expect(
    toChatBar(
      barWith({
        participants: [team('Corinthians'), team('Palmeiras')],
        participantFreeText: null
      }),
      now
    ).game?.title
  ).toBe('Corinthians × Palmeiras')
})
