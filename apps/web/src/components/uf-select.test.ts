import { expect, test } from 'bun:test'

import type { Municipio } from '@/components/internal/controle-cidades'
import { ufParaCidade } from './uf-select'

const MUNICIPIOS: Municipio[] = [
  ['Bom Jesus', 'PI'],
  ['Bom Jesus', 'RN'],
  ['Curitiba', 'PR'],
  ['São Paulo', 'SP']
]

test('cidade de um estado só preenche a UF, e troca a que não serve', () => {
  expect(ufParaCidade(MUNICIPIOS, 'sao paulo ', '')).toBe('SP')
  expect(ufParaCidade(MUNICIPIOS, 'Curitiba', 'SP')).toBe('PR')
})

test('cidade homônima mantém a UF que é um dos estados e esvazia a que não é', () => {
  expect(ufParaCidade(MUNICIPIOS, 'Bom Jesus', 'RN')).toBe('RN')
  expect(ufParaCidade(MUNICIPIOS, 'Bom Jesus', 'SP')).toBe('')
  expect(ufParaCidade(MUNICIPIOS, 'Bom Jesus', '')).toBe('')
})

test('cidade fora da lista não mexe na UF', () => {
  expect(ufParaCidade(MUNICIPIOS, 'Vila do Teste', 'SP')).toBe('SP')
  expect(ufParaCidade(MUNICIPIOS, '', 'SP')).toBe('SP')
})
