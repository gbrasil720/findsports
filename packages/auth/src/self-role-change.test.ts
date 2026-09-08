import { describe, expect, it } from 'bun:test'
import { assertNoSelfRoleChange } from './self-role-change'

describe('troca de papel pelo update-user', () => {
  it('recusa corpo que tenta mudar o papel', () => {
    expect(() => assertNoSelfRoleChange({ role: 'pub' })).toThrow(/papel/)
    expect(() =>
      assertNoSelfRoleChange({ name: 'Meu Bar', role: 'fan' })
    ).toThrow(/papel/)
    expect(() => assertNoSelfRoleChange({ role: null })).toThrow(/papel/)
  })

  it('aceita atualização de perfil sem papel', () => {
    expect(() => assertNoSelfRoleChange(undefined)).not.toThrow()
    expect(() => assertNoSelfRoleChange({ name: 'Meu Bar' })).not.toThrow()
    expect(() =>
      assertNoSelfRoleChange({ name: 'Meu Bar', image: null })
    ).not.toThrow()
  })
})
