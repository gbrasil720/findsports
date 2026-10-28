import { describe, expect, test } from 'bun:test'
import { linkDoApp } from './no-app'

// WEB-468: cada entrada da página "está no app" abre o app no lugar certo.
describe('linkDoApp', () => {
  test('bar no ar abre o bar', () => {
    expect(linkDoApp({ barId: 'b-1' })).toBe('onside://bar/b-1')
  })

  test('sem bar (torcedor, bar fora do ar) abre o app', () => {
    expect(linkDoApp({})).toBe('onside://')
    expect(linkDoApp({ barId: null })).toBe('onside://')
  })

  test('convite abre o convite, com o código escapado', () => {
    expect(linkDoApp({ convite: 'GB-4821' })).toBe('onside://convite/GB-4821')
    expect(linkDoApp({ convite: 'a/b c' })).toBe('onside://convite/a%2Fb%20c')
  })
})
