import { describe, expect, it } from 'bun:test'
import { carriesAppCookie, sameString } from './app-session-handoff'

describe('rotas em que o cookie sai da URL de volta ao app', () => {
  it('espelha o matcher do expo()', () => {
    for (const path of [
      '/verify-email',
      '/callback/apple',
      '/callback/google',
      '/oauth2/callback/apple',
      '/magic-link/verify'
    ])
      expect(carriesAppCookie(path)).toBe(true)
  })

  it('deixa o resto de fora', () => {
    for (const path of ['/sign-in/email', '/get-session', '/reset-password'])
      expect(carriesAppCookie(path)).toBe(false)
    expect(carriesAppCookie(undefined)).toBe(false)
  })
})

describe('comparação do desafio', () => {
  it('igual só com o mesmo texto', () => {
    expect(sameString('abc', 'abc')).toBe(true)
    expect(sameString('abc', 'abd')).toBe(false)
    expect(sameString('abc', 'abcd')).toBe(false)
  })
})
