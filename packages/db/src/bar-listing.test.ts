import { describe, expect, test } from 'bun:test'
import {
  buildListings,
  cityPath,
  type ListingBar,
  MIN_BARS_INDEXABLE_NEIGHBORHOOD,
  neighborhoodPath,
  properName
} from './bar-listing'

const bar = (n: number, over: Partial<ListingBar> = {}): ListingBar => ({
  id: `0000000${n}-0000-4000-8000-000000000000`,
  name: `Bar ${n}`,
  neighborhood: 'Vila Assunção',
  city: 'Santo André',
  uf: 'SP',
  photoUrl: null,
  updatedAt: new Date('2026-11-01T00:00:00Z'),
  ...over
})

describe('properName', () => {
  test('sobe a inicial e mantém preposição em minúscula', () => {
    expect(properName('vila assunção')).toBe('Vila Assunção')
    expect(properName('jardim do mar')).toBe('Jardim do Mar')
    expect(properName('  são   paulo ')).toBe('São Paulo')
  })
  test('não mexe no resto da palavra', () => {
    expect(properName('ABC Paulista')).toBe('ABC Paulista')
  })
})

describe('caminhos', () => {
  test('sem acento e com hífen', () => {
    expect(cityPath('Santo André')).toBe('/bares/santo-andre')
    expect(neighborhoodPath('Santo André', 'Vila assunção')).toBe(
      '/bares/santo-andre/vila-assuncao'
    )
  })
  test('nome sem letra não vira caminho', () => {
    expect(cityPath('★')).toBeNull()
    expect(neighborhoodPath('Santo André', '')).toBeNull()
  })
})

describe('buildListings', () => {
  test('grafias diferentes do bairro caem na mesma página', () => {
    const [city] = buildListings([
      bar(1, { neighborhood: 'Vila assunção' }),
      bar(2, { neighborhood: 'Vila Assunção' }),
      bar(3, { neighborhood: 'Vila Assunção' })
    ])
    expect(city?.neighborhoods).toHaveLength(1)
    expect(city?.neighborhoods[0]?.name).toBe('Vila Assunção')
    expect(city?.neighborhoods[0]?.bars).toHaveLength(3)
  })

  test('bairro só indexa a partir do piso', () => {
    const few = Array.from(
      { length: MIN_BARS_INDEXABLE_NEIGHBORHOOD - 1 },
      (_, i) => bar(i)
    )
    const enough = Array.from(
      { length: MIN_BARS_INDEXABLE_NEIGHBORHOOD },
      (_, i) => bar(i + 10, { neighborhood: 'Centro' })
    )
    const [city] = buildListings([...few, ...enough])
    const bySlug = new Map(city?.neighborhoods.map((n) => [n.slug, n]))
    expect(bySlug.get('vila-assuncao')?.indexable).toBe(false)
    expect(bySlug.get('centro')?.indexable).toBe(true)
  })

  test('cidades ordenadas por quantidade de bares', () => {
    const cities = buildListings([bar(1, { city: 'Mauá' }), bar(2), bar(3)])
    expect(cities.map((c) => c.slug)).toEqual(['santo-andre', 'maua'])
    expect(cities[0]?.uf).toBe('SP')
  })

  test('bar sem letra na cidade fica de fora', () => {
    expect(buildListings([bar(1, { city: '' })])).toEqual([])
  })
})
