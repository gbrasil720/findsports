import { describe, expect, test } from 'bun:test'

import { countLabel, plural } from './plural'

describe('plural', () => {
  test('singular só no exato 1', () => {
    expect(plural(1, 'liberado', 'liberados')).toBe('liberado')
    expect(plural(0, 'liberado', 'liberados')).toBe('liberados')
    expect(plural(2, 'liberado', 'liberados')).toBe('liberados')
  })

  test('countLabel monta o contador inteiro', () => {
    // Era exatamente isto que a tela mostrava errado: "1 liberados".
    expect(countLabel(1, 'liberado', 'liberados')).toBe('1 liberado')
    expect(countLabel(0, 'falha', 'falhas')).toBe('0 falhas')
    expect(countLabel(12, 'convite ativo', 'convites ativos')).toBe(
      '12 convites ativos'
    )
  })
})
