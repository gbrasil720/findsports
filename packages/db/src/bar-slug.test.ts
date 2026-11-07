import { describe, expect, test } from 'bun:test'
import { barPath, barSlug, parseBarRef } from './bar-slug'

const ID = '3f2a9c1b-0000-4000-8000-000000000e01'

describe('barSlug', () => {
  test('tira acento, junta nome e bairro', () => {
    expect(barSlug('Bar do Zé', 'Vila Madalena')).toBe(
      'bar-do-ze-vila-madalena'
    )
  })
  test('pontuação e espaços viram um hífen só', () => {
    expect(barSlug("  O'Malley's — Pub & Grill!! ", null)).toBe(
      'o-malley-s-pub-grill'
    )
  })
  test('nome sem letra nenhuma fica vazio', () => {
    expect(barSlug('★★★', '')).toBe('')
  })
  test('corta nome comprido sem deixar hífen no fim', () => {
    const slug = barSlug('a'.repeat(79), 'b')
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('barPath', () => {
  test('slug e 8 hex do id', () => {
    expect(
      barPath({ id: ID, name: 'Bar do Zé', neighborhood: 'Vila Madalena' })
    ).toBe('/bar/bar-do-ze-vila-madalena-3f2a9c1b')
  })
  test('sem slug, só o prefixo', () => {
    expect(barPath({ id: ID, name: '★', neighborhood: null })).toBe(
      '/bar/3f2a9c1b'
    )
  })
})

describe('parseBarRef', () => {
  test('o último trecho', () => {
    expect(parseBarRef('bar-do-ze-vila-madalena-3f2a9c1b')).toBe('3f2a9c1b')
  })
  test('nome velho com o mesmo prefixo resolve igual', () => {
    expect(parseBarRef('outro-nome-3F2A9C1B')).toBe('3f2a9c1b')
  })
  test('id inteiro', () => {
    expect(parseBarRef(ID)).toBe('3f2a9c1b')
  })
  test('só o prefixo', () => {
    expect(parseBarRef('3f2a9c1b')).toBe('3f2a9c1b')
  })
  test('sem prefixo válido', () => {
    expect(parseBarRef('bar-do-ze')).toBeNull()
    expect(parseBarRef('bar-do-ze-3f2a9c1')).toBeNull()
    expect(parseBarRef('bar-do-ze-3f2a9c1g')).toBeNull()
    expect(parseBarRef('')).toBeNull()
  })
  test('ida e volta', () => {
    expect(
      parseBarRef(barPath({ id: ID, name: 'X', neighborhood: 'Y' }).slice(5))
    ).toBe('3f2a9c1b')
  })
})
