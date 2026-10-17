import { describe, expect, it } from 'bun:test'
import { distanceKm } from './explore'
import { sortFavorites } from './favorite-list'

const fav = (name: string, lat: number, startsAt?: string) => ({
  bar: {
    name,
    latitude: String(lat),
    longitude: '-46.68',
    events: startsAt ? [{ startsAt, endsAt: null }] : []
  }
})
const here = { lat: -23.56, lng: -46.68 }

describe('sortFavorites', () => {
  const list = [
    fav('Sem jogo', -23.561),
    fav('Mais tarde', -23.6, '2026-10-17T23:00:00Z'),
    fav('Ao vivo', -23.7, '2026-10-17T21:00:00Z')
  ]

  it('próximo jogo primeiro; sem jogo no fim', () => {
    expect(
      sortFavorites(list, 'game', here, distanceKm).map((f) => f.bar.name)
    ).toEqual(['Ao vivo', 'Mais tarde', 'Sem jogo'])
  })

  it('distância do mais perto ao mais longe', () => {
    expect(
      sortFavorites(list, 'distance', here, distanceKm).map((f) => f.bar.name)
    ).toEqual(['Sem jogo', 'Mais tarde', 'Ao vivo'])
  })
})
