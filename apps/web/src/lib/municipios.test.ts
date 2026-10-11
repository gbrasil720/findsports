import { describe, expect, test } from 'bun:test'

import { filtrarMunicipios, type Municipio } from './municipios'

/**
 * Recorte da lista real, com os casos que importam: homônimo entre estados,
 * acento, e nome que só casa no meio da string.
 */
const MUNICIPIOS: Municipio[] = [
  ['Bom Jesus', 'PI'],
  ['Bom Jesus', 'RN'],
  ['Campinas', 'SP'],
  ['Cristais Paulista', 'SP'],
  ['São Bernardo do Campo', 'SP'],
  ['São Paulo', 'SP']
]

describe('filtrarMunicipios', () => {
  test('busca vazia não sugere nada', () => {
    expect(filtrarMunicipios(MUNICIPIOS, '')).toEqual([])
    expect(filtrarMunicipios(MUNICIPIOS, '   ')).toEqual([])
  })

  test('ignora acento e caixa', () => {
    expect(filtrarMunicipios(MUNICIPIOS, 'sao paulo')).toEqual([
      ['São Paulo', 'SP']
    ])
    expect(filtrarMunicipios(MUNICIPIOS, 'SÃO PAULO')).toEqual([
      ['São Paulo', 'SP']
    ])
  })

  test('prefixo vem antes de ocorrência no meio do nome', () => {
    const resultado = filtrarMunicipios(MUNICIPIOS, 'paulo')
    expect(resultado[0]).toEqual(['São Paulo', 'SP'])
  })

  test('mantém homônimos de estados diferentes como opções distintas', () => {
    expect(filtrarMunicipios(MUNICIPIOS, 'bom jesus')).toEqual([
      ['Bom Jesus', 'PI'],
      ['Bom Jesus', 'RN']
    ])
  })
})
