import { describe, expect, it } from 'bun:test'

import {
  AMENITIES,
  AMENITY_GROUPS,
  amenitiesByGroup,
  MAX_SCREEN_COUNT,
  motivoTelasInvalido,
  normalizeAmenityIds,
  publicAmenityIds,
  writableAmenityIds
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

describe('motivoTelasInvalido', () => {
  it('aceita vazio e a faixa do servidor, de 0 ao máximo', () => {
    for (const telas of [null, undefined, 0, 4, MAX_SCREEN_COUNT]) {
      expect(motivoTelasInvalido(telas)).toBeNull()
    }
  })

  it('recusa negativo, fração e acima do máximo, com mensagem (WEB-280)', () => {
    for (const telas of [-3, 2.5, MAX_SCREEN_COUNT + 1, Number.NaN]) {
      expect(motivoTelasInvalido(telas)).toBe(
        'Informe um número inteiro de 0 a 99.'
      )
    }
  })
})

describe('publicAmenityIds', () => {
  it('mostra "Aceita reserva" de quem recebe reservas, e só deles, marcada ou não', () => {
    expect(AMENITIES.find(({ id }) => id === 10)?.slug).toBe('reservations')

    // Recebe: aparece uma vez, com o id gravado ou sem ele.
    expect(publicAmenityIds([1, 11], true)).toEqual([1, 11, 10])
    expect(publicAmenityIds([1, 10, 11], true)).toEqual([1, 11, 10])
    expect(publicAmenityIds([], true)).toEqual([10])

    // Não recebe: o id gravado não aparece, e o resto fica.
    expect(publicAmenityIds([1, 10, 11], false)).toEqual([1, 11])
    expect(publicAmenityIds([1, 11], false)).toEqual([1, 11])
  })
})

describe('writableAmenityIds', () => {
  it('ignora "Aceita reserva" que vem do cliente e preserva a já gravada', () => {
    // Não regrava: o cliente manda, o banco não tinha.
    expect(writableAmenityIds([4, 10, 1])).toEqual([1, 4])
    expect(writableAmenityIds([4, 10, 1], [2])).toEqual([1, 4])
    // Não apaga: o banco tinha, o cliente mande ou não.
    expect(writableAmenityIds([4, 1], [1, 10])).toEqual([1, 4, 10])
    expect(writableAmenityIds([10], [10])).toEqual([10])
    expect(writableAmenityIds([], [8, 10])).toEqual([10])
    // O resto continua normalizado.
    expect(writableAmenityIds([4, 4, 9999])).toEqual([4])
  })
})
