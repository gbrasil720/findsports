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
  // Um time só: antes saía o campeonato.
  expect(
    toChatBar(
      barWith({
        participants: [team('Verstappen')],
        participantFreeText: null
      }),
      now
    ).game?.title
  ).toBe('Verstappen')
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
