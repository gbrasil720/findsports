import { describe, expect, test } from 'bun:test'

import { getNextTabId } from './roving-tabs'

const IDS = ['um', 'dois', 'tres'] as const

describe('roving tabs', () => {
  test('anda entre vizinhas e dá a volta nas duas pontas', () => {
    expect(getNextTabId(IDS, 'um', 'ArrowRight')).toBe('dois')
    expect(getNextTabId(IDS, 'dois', 'ArrowDown')).toBe('tres')
    expect(getNextTabId(IDS, 'tres', 'ArrowRight')).toBe('um')
    expect(getNextTabId(IDS, 'um', 'ArrowLeft')).toBe('tres')
    expect(getNextTabId(IDS, 'dois', 'ArrowUp')).toBe('um')
  })

  test('Home e End vão às pontas', () => {
    expect(getNextTabId(IDS, 'dois', 'Home')).toBe('um')
    expect(getNextTabId(IDS, 'dois', 'End')).toBe('tres')
  })

  test('devolve null para tecla que não é de navegação', () => {
    // É o que impede a faixa de engolir Tab, Enter e espaço.
    expect(getNextTabId(IDS, 'dois', 'Tab')).toBeNull()
    expect(getNextTabId(IDS, 'dois', 'Enter')).toBeNull()
    expect(getNextTabId(IDS, 'dois', ' ')).toBeNull()
  })

  test('devolve null quando a aba atual não pertence à faixa', () => {
    expect(getNextTabId(IDS, 'quatro' as 'um', 'ArrowRight')).toBeNull()
  })
})
