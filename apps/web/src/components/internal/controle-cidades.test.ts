import { describe, expect, test } from 'bun:test'

import { filtrarMunicipios, type Municipio } from './controle-cidades'

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
    expect(filtrarMunicipios(MUNICIPIOS, '', new Set())).toEqual([])
    expect(filtrarMunicipios(MUNICIPIOS, '   ', new Set())).toEqual([])
  })

  test('ignora acento e caixa', () => {
    expect(filtrarMunicipios(MUNICIPIOS, 'sao paulo', new Set())).toEqual([
      ['São Paulo', 'SP']
    ])
    expect(filtrarMunicipios(MUNICIPIOS, 'SÃO PAULO', new Set())).toEqual([
      ['São Paulo', 'SP']
    ])
  })

  test('prefixo vem antes de ocorrência no meio do nome', () => {
    const resultado = filtrarMunicipios(MUNICIPIOS, 'paulo', new Set())
    expect(resultado[0]).toEqual(['São Paulo', 'SP'])
  })

  test('mantém homônimos de estados diferentes como opções distintas', () => {
    expect(filtrarMunicipios(MUNICIPIOS, 'bom jesus', new Set())).toEqual([
      ['Bom Jesus', 'PI'],
      ['Bom Jesus', 'RN']
    ])
  })

  /**
   * Uma cidade já na lista some das sugestões — inclusive o homônimo de outro
   * estado, porque o valor gravado é só o nome e adicionar o segundo não
   * mudaria nada no que `cidadeLiberada` aceita.
   */
  test('omite cidade já adicionada', () => {
    const jaAdicionadas = new Set(['sao paulo'])
    expect(filtrarMunicipios(MUNICIPIOS, 'sao paulo', jaAdicionadas)).toEqual(
      []
    )
  })
})
