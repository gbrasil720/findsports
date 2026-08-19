import { describe, expect, test } from 'bun:test'

import type { Favorite } from './profile-model'
import {
  groupFavoritesByCity,
  selectUpcomingFavoriteEvents,
  sortAndFilterFavorites
} from './profile-selectors'

function makeFavorite({
  id,
  name,
  city,
  eventStarts = []
}: {
  id: string
  name: string
  city: string
  eventStarts?: string[]
}): Favorite {
  return {
    userId: 'user-1',
    barId: id,
    createdAt: '2026-08-01T00:00:00.000Z',
    bar: {
      id,
      userId: `owner-${id}`,
      name,
      description: null,
      phone: null,
      address: 'Rua Teste, 1',
      neighborhood: 'Centro',
      city,
      latitude: '-23.55052000',
      longitude: '-46.63330800',
      photoUrl: null,
      phoneAcceptsWhatsapp: false,
      plan: 'starter',
      isActive: true,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      events: eventStarts.map((startsAt, index) => ({
        id: `event-${id}-${index}`,
        barId: id,
        sportId: 'sport-1',
        championship: 'Liga de teste',
        startsAt,
        endsAt: null,
        participantFreeText: null,
        createdAt: '2026-08-01T00:00:00.000Z',
        sport: {
          id: 'sport-1',
          name: 'Futebol',
          slug: 'futebol',
          iconUrl: null,
          createdAt: '2026-08-01T00:00:00.000Z'
        },
        participants: []
      }))
    }
  }
}

const FAVORITES = [
  makeFavorite({
    id: 'later',
    name: 'Arena',
    city: 'São Paulo',
    eventStarts: ['2026-08-15T20:00:00.000Z']
  }),
  makeFavorite({ id: 'empty', name: 'Botequim', city: 'Campinas' }),
  makeFavorite({
    id: 'earlier',
    name: 'Clube',
    city: 'Campinas',
    eventStarts: ['2026-08-14T18:00:00.000Z']
  })
]

describe('profile favorite selectors', () => {
  test('sorts by the next event while keeping bars without events last', () => {
    expect(
      sortAndFilterFavorites(FAVORITES, 'upcoming', false).map(
        (favorite) => favorite.bar.id
      )
    ).toEqual(['earlier', 'later', 'empty'])
  })

  test('sorts alphabetically and by city without mutating the input', () => {
    expect(
      sortAndFilterFavorites(FAVORITES, 'az', false).map(
        (favorite) => favorite.bar.name
      )
    ).toEqual(['Arena', 'Botequim', 'Clube'])
    expect(
      sortAndFilterFavorites(FAVORITES, 'city', false).map(
        (favorite) => `${favorite.bar.city}:${favorite.bar.name}`
      )
    ).toEqual(['Campinas:Botequim', 'Campinas:Clube', 'São Paulo:Arena'])
    expect(FAVORITES.map((favorite) => favorite.bar.id)).toEqual([
      'later',
      'empty',
      'earlier'
    ])
  })

  test('filters bars without upcoming events', () => {
    expect(
      sortAndFilterFavorites(FAVORITES, 'upcoming', true).map(
        (favorite) => favorite.bar.id
      )
    ).toEqual(['earlier', 'later'])
  })

  test('groups favorites by city in display order', () => {
    const groups = groupFavoritesByCity(FAVORITES)
    expect([...groups.keys()]).toEqual(['São Paulo', 'Campinas'])
    expect(groups.get('Campinas')?.map((favorite) => favorite.bar.id)).toEqual([
      'empty',
      'earlier'
    ])
  })

  test('flattens and orders the next events across favorite bars', () => {
    expect(
      selectUpcomingFavoriteEvents(FAVORITES).map((event) => ({
        id: event.id,
        barId: event.bar.id
      }))
    ).toEqual([
      { id: 'event-earlier-0', barId: 'earlier' },
      { id: 'event-later-0', barId: 'later' }
    ])
  })
})
