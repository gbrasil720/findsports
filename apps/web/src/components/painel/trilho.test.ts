import { describe, expect, it } from 'bun:test'
import { valorTrilho } from './trilho'

describe('valorTrilho', () => {
  it('no desktop segue a escolha guardada', () => {
    expect(valorTrilho(true, false, false)).toBeNull()
    expect(valorTrilho(true, true, false)).toBe('1')
    // A sidebar aberta por cima não existe no desktop.
    expect(valorTrilho(true, true, true)).toBe('1')
  })

  it('entre 861 e 1180 px é trilho, e abrir vai por cima', () => {
    expect(valorTrilho(false, false, false)).toBe('1')
    expect(valorTrilho(false, true, false)).toBe('1')
    expect(valorTrilho(false, false, true)).toBe('sobre')
  })
})
