import { expect, test } from 'bun:test'
import type { CatalogEntry } from './catalog'
import { mergeProposal, shortClubName } from './propose'

test('nome curto tira o "Futebol Clube" e companhia (proposta para revisar)', () => {
  expect(shortClubName('Associação Atlética Ponte Preta')).toBe('Ponte Preta')
  expect(shortClubName('Coritiba Foot Ball Club')).toBe('Coritiba')
  expect(shortClubName('Associação Chapecoense de Futebol')).toBe('Chapecoense')
  expect(shortClubName('Clube do Remo')).toBe('Remo')
  expect(shortClubName('América Futebol Clube (Minas Gerais)')).toBe('América')
  expect(shortClubName('Real Madrid CF')).toBe('Real Madrid')
})

const entry = (fields: Partial<CatalogEntry> & { key: string; name: string }) =>
  ({
    kind: 'team',
    country: 'BR',
    relevance: 0,
    aliases: [],
    ...fields
  }) as CatalogEntry

test('o que já foi revisado não muda; só relevância e apelidos', () => {
  const { entries, added } = mergeProposal(
    [entry({ key: 'Q35933', name: 'Corinthians', featured: true })],
    [
      entry({
        key: 'Q35933',
        name: 'Corinthians Paulista',
        relevance: 104,
        aliases: ['Timão']
      })
    ]
  )
  expect(added).toEqual([])
  expect(entries).toEqual([
    entry({
      key: 'Q35933',
      name: 'Corinthians',
      featured: true,
      relevance: 104,
      aliases: ['Timão']
    })
  ])
})

test('entrada à mão que a fonte passou a trazer ganha a chave da fonte', () => {
  const { entries, added } = mergeProposal(
    [
      entry({
        key: 'manual:minotauro',
        name: 'Rodrigo Minotauro',
        featured: true
      })
    ],
    [
      entry({
        key: 'Q549014',
        name: 'Antônio Rodrigo Nogueira',
        aliases: ['Rodrigo Minotauro']
      })
    ]
  )
  expect(added).toEqual([])
  expect(entries).toMatchObject([
    { key: 'Q549014', name: 'Rodrigo Minotauro', featured: true }
  ])
})

test('novo entra; recusado e sumido da fonte ficam e são listados', () => {
  const { entries, added, missing } = mergeProposal(
    [
      entry({ key: 'Q1', name: 'Oakland Raiders', hidden: true }),
      entry({ key: 'Q2', name: 'Extinto' })
    ],
    [
      entry({ key: 'Q1', name: 'Oakland Raiders' }),
      entry({ key: 'Q3', name: 'Novo' })
    ]
  )
  expect(added).toEqual(['Novo'])
  expect(missing).toEqual(['Extinto'])
  expect(entries.map((e) => [e.key, e.hidden ?? false])).toEqual([
    ['Q1', true],
    ['Q2', false],
    ['Q3', false]
  ])
})
