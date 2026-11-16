import { beforeEach, describe, expect, test } from 'bun:test'
import {
  acaoPulaOnboarding,
  BEM_VINDO_PATH,
  comAcao,
  contaNovaPodeVer,
  contaRecente,
  destinoContaNova,
  esquecerAcao,
  guardarAcao,
  lerAcao,
  lerNovo,
  semAcao,
  semNovo,
  temAcao,
  tomarAcaoPendente
} from './acao'

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

describe('conta nova por uma ação', () => {
  test('toda ação pula o onboarding, menos a do app', () => {
    expect(acaoPulaOnboarding(`/bar/x?acao=fav.${ID}`)).toBe(true)
    expect(acaoPulaOnboarding(`/dashboard?acao=lembrar.${ID}`)).toBe(true)
    // O formato antigo da página do bar também: ela conclui com o contexto.
    expect(acaoPulaOnboarding('/bar/x?jogo=1&acao=vou')).toBe(true)
    expect(acaoPulaOnboarding('/dashboard?acao=app')).toBe(false)
    expect(acaoPulaOnboarding('/dashboard')).toBe(false)
  })

  test('a ação concluída leva à tela dela com o card', () => {
    expect(destinoContaNova({ tipo: 'vou', id: JOGO }, true)).toBe(
      `/dashboard/codigo/${JOGO}?novo=vou`
    )
    expect(destinoContaNova({ tipo: 'vou', id: JOGO }, false)).toBe(
      '/dashboard/games?novo=vouc'
    )
    expect(destinoContaNova({ tipo: 'fav', id: ID })).toBe(
      '/dashboard/seus-bares?aba=salvos&novo=fav'
    )
    // O lembrete não tem tela: vai direto às preferências curtas.
    expect(destinoContaNova({ tipo: 'lembrar', id: JOGO })).toBe(
      `${BEM_VINDO_PATH}?feito=lembrar`
    )
  })

  test('o card só aparece com um `?novo=` conhecido, e sai da URL', () => {
    expect(lerNovo('vou')).toBe('vou')
    expect(lerNovo('vouc')).toBe('vouc')
    expect(lerNovo('app')).toBeNull()
    expect(lerNovo(undefined)).toBeNull()
    expect(semNovo('/dashboard/seus-bares?aba=salvos&novo=fav')).toBe(
      '/dashboard/seus-bares?aba=salvos'
    )
  })

  test('sem onboarding, só as telas da ação, do card e as preferências curtas', () => {
    expect(contaNovaPodeVer(BEM_VINDO_PATH, BEM_VINDO_PATH)).toBe(true)
    expect(
      contaNovaPodeVer('/dashboard/games', '/dashboard/games?novo=vouc')
    ).toBe(true)
    expect(contaNovaPodeVer('/bar/x', `/bar/x?acao=fav.${ID}`)).toBe(true)
    expect(contaNovaPodeVer('/dashboard/games', '/dashboard/games')).toBe(false)
    expect(contaNovaPodeVer('/dashboard', '/dashboard?novo=outro')).toBe(false)
    expect(contaNovaPodeVer('/dashboard', '/dashboard?acao=app')).toBe(false)
  })

  test('conta de até um dia é "criada"; a de antes não', () => {
    const agora = new Date('2026-11-07T12:00:00Z')
    expect(contaRecente('2026-11-07T01:00:00Z', agora)).toBe(true)
    expect(contaRecente(new Date('2026-11-06T12:00:00Z'), agora)).toBe(true)
    expect(contaRecente('2026-11-06T11:59:00Z', agora)).toBe(false)
    expect(contaRecente(undefined, agora)).toBe(true)
  })
})

// Achado `web-acao-url-auto-executes-mutation`: link de fora com `?acao=` não
// grava sozinho; só a ação que este navegador guardou ao abrir a folha.
describe('ação pendente deste navegador', () => {
  const guardado = new Map<string, string>()
  beforeEach(() => {
    guardado.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => guardado.get(k) ?? null,
        setItem: (k: string, v: string) => guardado.set(k, v),
        removeItem: (k: string) => guardado.delete(k)
      }
    })
  })

  test('sem nada guardado, a ação da URL não sai sozinha', () => {
    expect(tomarAcaoPendente({ tipo: 'vou', id: JOGO })).toBe(false)
  })

  test('a mesma ação guardada sai uma vez só', () => {
    guardarAcao({ tipo: 'fav', id: ID })
    expect(tomarAcaoPendente({ tipo: 'fav', id: ID })).toBe(true)
    expect(tomarAcaoPendente({ tipo: 'fav', id: ID })).toBe(false)
  })

  test('outra ação ou outro id não vale, e apaga o registro', () => {
    guardarAcao({ tipo: 'fav', id: ID })
    expect(tomarAcaoPendente({ tipo: 'vou', id: ID })).toBe(false)
    guardarAcao({ tipo: 'fav', id: ID })
    expect(tomarAcaoPendente({ tipo: 'fav', id: JOGO })).toBe(false)
    expect(tomarAcaoPendente({ tipo: 'fav', id: ID })).toBe(false)
  })

  test('vence em um dia', () => {
    const agora = Date.now()
    guardarAcao({ tipo: 'app' }, agora - 25 * 60 * 60 * 1000)
    expect(tomarAcaoPendente({ tipo: 'app' }, agora)).toBe(false)
  })

  test('esquecer apaga; armazenamento bloqueado pede confirmação', () => {
    guardarAcao({ tipo: 'lembrar', id: JOGO })
    esquecerAcao()
    expect(tomarAcaoPendente({ tipo: 'lembrar', id: JOGO })).toBe(false)
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('SecurityError')
      }
    })
    expect(() => guardarAcao({ tipo: 'app' })).not.toThrow()
    expect(tomarAcaoPendente({ tipo: 'app' })).toBe(false)
  })
})
