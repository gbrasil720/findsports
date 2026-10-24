import { describe, expect, test } from 'bun:test'
import { gameTitle, participantNames } from './game-title'

const base = { championship: 'Brasileirão', participantFreeText: null }

describe('gameTitle', () => {
  test('os times, na ordem em que vieram, por " × "', () => {
    expect(gameTitle({ ...base, participants: ['Grêmio', 'Inter'] })).toBe(
      'Grêmio × Inter'
    )
    expect(
      gameTitle({
        ...base,
        participants: [
          { team: { name: 'Corinthians' } },
          { team: { name: 'Palmeiras' } }
        ]
      })
    ).toBe('Corinthians × Palmeiras')
  })

  test('um time só, ou mais de dois, também dão nome ao jogo', () => {
    expect(gameTitle({ ...base, participants: ['Verstappen'] })).toBe(
      'Verstappen'
    )
    expect(gameTitle({ ...base, participants: ['A', 'B', 'C'] })).toBe(
      'A × B × C'
    )
  })

  test('sem times, o texto livre; sem nada, o campeonato', () => {
    expect(
      gameTitle({ ...base, participants: [], participantFreeText: 'UFC 300' })
    ).toBe('UFC 300')
    expect(gameTitle({ ...base, participants: [] })).toBe('Brasileirão')
  })

  test('texto livre vazio ou em branco não esconde o campeonato', () => {
    for (const participantFreeText of ['', '   '])
      expect(
        gameTitle({ ...base, participants: [], participantFreeText })
      ).toBe('Brasileirão')
  })

  test('participante sem time não vira nome', () => {
    expect(
      gameTitle({
        ...base,
        participants: [{ team: null }, { team: { name: 'Flamengo' } }]
      })
    ).toBe('Flamengo')
    expect(participantNames({ participants: [{}, 'Vasco'] })).toEqual(['Vasco'])
  })
})
