import { describe, expect, test } from 'bun:test'
import { comAcao, lerAcao, semAcao, temAcao } from './acao'

const ID = '0b6c6f2e-9d3a-4c41-8f0e-2a6b1d7c9e10'
const JOGO = '7f1e2d3c-4b5a-4968-8776-655443322110'

describe('acao', () => {
  test('lê o formato <tipo>.<id> e recusa o resto', () => {
    expect(lerAcao(`fav.${ID}`)).toEqual({ tipo: 'fav', id: ID })
    expect(lerAcao(`vou.${ID}`)).toEqual({ tipo: 'vou', id: ID })
    expect(lerAcao(`lembrar.${ID}`)).toEqual({ tipo: 'lembrar', id: ID })
    expect(lerAcao('fav.nao-e-id')).toBeNull()
    expect(lerAcao(`apagar.${ID}`)).toBeNull()
    expect(lerAcao(1)).toBeNull()
  })

  test('formato antigo da página do bar vale com o contexto dela', () => {
    const legado = { barId: ID, eventId: JOGO }
    expect(lerAcao('salvar', legado)).toEqual({ tipo: 'fav', id: ID })
    expect(lerAcao('vou', legado)).toEqual({ tipo: 'vou', id: JOGO })
    expect(lerAcao('vou', { barId: ID })).toBeNull()
    expect(lerAcao('salvar')).toBeNull()
  })

  test('põe e tira a ação da URL', () => {
    const com = comAcao('/bar/x?jogo=1', { tipo: 'vou', id: ID })
    expect(com).toBe(`/bar/x?jogo=1&acao=vou.${ID}`)
    expect(temAcao(com)).toBe(true)
    expect(semAcao(`${com}#a`)).toBe('/bar/x?jogo=1#a')
    expect(temAcao('/dashboard')).toBe(false)
  })
})
