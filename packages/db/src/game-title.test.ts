import { describe, expect, test } from 'bun:test'
import { gameTitle, matchSides, participantNames } from './game-title'

const base = { championship: 'Fórmula 1', participantFreeText: null }
const pilots = ['Bortoleto', 'Verstappen', 'Hamilton']

describe('gameTitle', () => {
  test('dois participantes são um confronto: "A × B", na ordem', () => {
    expect(gameTitle({ ...base, participants: ['Grêmio', 'Inter'] })).toBe(
      'Grêmio × Inter'
    )
    expect(
      gameTitle({
        ...base,
        participantFreeText: 'Grenal',
        participants: [
          { team: { name: 'Corinthians' } },
          { team: { name: 'Palmeiras' } }
        ]
      })
    ).toBe('Corinthians × Palmeiras')
  })

  test('três ou mais não são confronto: o texto livre, senão o campeonato', () => {
    expect(
      gameTitle({
        ...base,
        participants: pilots,
        participantFreeText: 'GP de São Paulo'
      })
    ).toBe('GP de São Paulo')
    expect(gameTitle({ ...base, participants: pilots })).toBe('Fórmula 1')
  })

  test('nenhum ou um participante: o texto livre, senão o campeonato', () => {
    expect(
      gameTitle({ ...base, participants: [], participantFreeText: 'UFC 300' })
    ).toBe('UFC 300')
    expect(gameTitle({ ...base, participants: [] })).toBe('Fórmula 1')
    expect(gameTitle({ ...base, participants: ['Verstappen'] })).toBe(
      'Fórmula 1'
    )
  })

  test('texto livre vazio ou em branco não esconde o campeonato', () => {
    for (const participantFreeText of ['', '   '])
      expect(
        gameTitle({ ...base, participants: pilots, participantFreeText })
      ).toBe('Fórmula 1')
  })

  test('participante sem time não conta', () => {
    expect(
      gameTitle({
        ...base,
        participants: [
          { team: null },
          { team: { name: 'Flamengo' } },
          { team: { name: 'Vasco' } }
        ]
      })
    ).toBe('Flamengo × Vasco')
    expect(participantNames({ participants: [{}, 'Vasco'] })).toEqual(['Vasco'])
  })
})

test('matchSides: só com exatamente dois', () => {
  expect(matchSides({ participants: ['A', 'B'] })).toEqual(['A', 'B'])
  expect(matchSides({ participants: pilots })).toBeNull()
  expect(matchSides({ participants: ['A'] })).toBeNull()
})
