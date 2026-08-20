import { describe, expect, it } from 'bun:test'

import {
  AMENITIES,
  AMENITY_GROUPS,
  amenitiesByGroup,
  normalizeAmenityIds
} from './amenities'

describe('vocabulário de características', () => {
  it('não repete id nem slug', () => {
    const ids = AMENITIES.map((amenity) => amenity.id)
    const slugs = AMENITIES.map((amenity) => amenity.slug)

    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('só usa grupos que existem', () => {
    const grupos = new Set(AMENITY_GROUPS.map((group) => group.key))

    for (const amenity of AMENITIES) {
      expect(grupos.has(amenity.group)).toBe(true)
    }
  })
})

describe('normalizeAmenityIds', () => {
  it('ordena — a ordem é o que faz o cache acertar', () => {
    expect(normalizeAmenityIds([8, 1, 5])).toEqual([1, 5, 8])
    expect(normalizeAmenityIds([1, 5, 8])).toEqual(
      normalizeAmenityIds([8, 5, 1])
    )
  })

  it('remove repetido', () => {
    expect(normalizeAmenityIds([1, 1, 1])).toEqual([1])
  })

  it('descarta id desconhecido em vez de recusar a lista inteira', () => {
    expect(normalizeAmenityIds([1, 9999])).toEqual([1])
    expect(normalizeAmenityIds([9999])).toEqual([])
  })
})

describe('amenitiesByGroup', () => {
  it('omite grupo sem nada marcado', () => {
    const grupos = amenitiesByGroup([1])

    expect(grupos).toHaveLength(1)
    expect(grupos[0]?.key).toBe('watch')
    expect(grupos[0]?.amenities.map((a) => a.id)).toEqual([1])
  })

  it('devolve lista vazia quando nada foi marcado', () => {
    expect(amenitiesByGroup([])).toEqual([])
  })

  it('ignora id desconhecido', () => {
    expect(amenitiesByGroup([9999])).toEqual([])
  })

  it('mantém a ordem do vocabulário dentro do grupo', () => {
    const grupos = amenitiesByGroup([3, 1, 2])

    expect(grupos[0]?.amenities.map((a) => a.id)).toEqual([1, 2, 3])
  })
})
