import { describe, expect, test } from 'bun:test'
import {
  getRetryableCodes,
  getTeamMessage,
  type LateEntryResult,
  splitLateCodes
} from './code-confirmation'

describe('código pela comanda (WEB-412)', () => {
  test('o recado à equipe leva a oferta escrita, ou a da casa em geral', () => {
    expect(getTeamMessage('Chopp em dobro')).toContain(
      'tipo K7M·R4P) ganha a oferta da casa: Chopp em dobro.\n'
    )
    expect(getTeamMessage('Chopp em dobro!')).toContain('Chopp em dobro!\n')
    expect(getTeamMessage(null)).toContain('ganha a oferta da casa.')
    expect(getTeamMessage(null)).toContain('Anotem o código na comanda dele.')
  })

  test('um código por linha; espaço dentro do código não separa', () => {
    expect(splitLateCodes('A7K 29Q\n\nB8M·34R, c9n45s;  \n')).toEqual([
      'A7K 29Q',
      'B8M·34R',
      'c9n45s'
    ])
  })

  test('volta para a caixa só o que dá para corrigir', () => {
    const results = [
      { code: 'AAAAAA', status: 'logged' },
      { code: 'BBBBBB', status: 'not_found' },
      { code: 'CCCCCC', status: 'expired' },
      { code: 'DDDDDD', status: 'limited' }
    ] as LateEntryResult[]
    expect(getRetryableCodes(results)).toEqual(['BBBBBB', 'DDDDDD'])
  })
})
