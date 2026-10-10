import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import type { ProfileEvent } from '@/domain/pub-profile'
import { EventsList } from './events-list'

const game = (id: string, teams: string[]): ProfileEvent => ({
  id,
  championship: 'Brasileirão',
  startsAt: new Date('2099-10-13T21:30:00'),
  endsAt: null,
  participantFreeText: null,
  sport: { name: 'Futebol', slug: 'futebol' },
  participants: teams.map((name) => ({ team: { name, logoUrl: null } }))
})

const classico = game('classico', ['Corinthians', 'Palmeiras'])
const outro = game('outro', ['Flamengo', 'Grêmio'])

const render = (
  events: ProfileEvent[],
  highlightedEventId: string | null,
  isOwner = false
) =>
  renderToStaticMarkup(
    <EventsList
      events={events}
      highlightedEventId={highlightedEventId}
      whatsappUrl={null}
      onWhatsApp={() => {}}
      isOwner={isOwner}
    />
  )

describe('EventsList', () => {
  // WEB-345: o estado vazio dizia "ainda não cadastrou jogos" logo abaixo do
  // jogo em destaque.
  test('um único jogo, já em destaque: a seção não aparece, nem para o dono', () => {
    expect(render([classico], classico.id)).toBe('')
    expect(render([classico], classico.id, true)).toBe('')
  })

  test('dois jogos: "Também vai passar" lista só o que não está em destaque', () => {
    const markup = render([classico, outro], classico.id)
    expect(markup).toContain('Também vai passar')
    expect(markup).toContain('Flamengo × Grêmio')
    expect(markup).not.toContain('Corinthians × Palmeiras')
    expect(markup).not.toContain('ainda não cadastrou jogos')
  })

  test('sem jogo nenhum, o estado vazio continua', () => {
    const markup = render([], null)
    expect(markup).toContain('Programação')
    expect(markup).toContain('Esse bar ainda não cadastrou jogos')
  })
})
