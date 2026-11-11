import { describe, expect, it } from 'bun:test'
import {
  filterPhotos,
  type GalleryPhoto,
  galleryChips,
  parseFilter,
  sentMonth
} from './gallery'

const photo = (id: string, category: GalleryPhoto['category']) => ({
  id,
  url: `https://media.onside.sh/${id}`,
  category,
  caption: null,
  createdAt: '2026-09-14T12:00:00Z'
})

// Como `pubs.getById` devolve: por categoria, na ordem do dono.
const PHOTOS = [
  photo('t1', 'telao'),
  photo('t2', 'telao'),
  photo('a1', 'area_externa'),
  photo('c1', 'comida')
]

describe('galeria do bar (25a–25c)', () => {
  it('chips: Tudo e cada categoria com foto, com a contagem', () => {
    expect(galleryChips(PHOTOS)).toEqual([
      { key: 'all', label: 'Tudo', count: 4 },
      { key: 'telao', label: 'Telão', count: 2 },
      { key: 'area_externa', label: 'Área externa', count: 1 },
      { key: 'comida', label: 'Comida', count: 1 }
    ])
  })

  it('filtra por categoria, e o filtro da URL só vale se existir', () => {
    expect(filterPhotos(PHOTOS, 'telao').map((p) => p.id)).toEqual(['t1', 't2'])
    expect(filterPhotos(PHOTOS, 'all')).toHaveLength(4)
    expect(parseFilter(PHOTOS, 'comida')).toBe('comida')
    expect(parseFilter(PHOTOS, 'balcao')).toBe('all')
    expect(parseFilter(PHOTOS, undefined)).toBe('all')
  })

  it('o mês do envio, no relógio de Brasília', () => {
    expect(sentMonth('2026-09-14T12:00:00Z')).toBe('set 2026')
    // 1º de outubro à 1 h UTC ainda é 30 de setembro em Brasília.
    expect(sentMonth('2026-10-01T01:00:00Z')).toBe('set 2026')
  })
})
