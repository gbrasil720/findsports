import { describe, expect, test } from 'bun:test'

import { getAdminRouteFromHash } from './admin-tabs'

describe('hash das abas antigas do /admin', () => {
  test('cada aba antiga leva à rota nova do painel', () => {
    expect(getAdminRouteFromHash('#admin-visao')).toBe('/admin')
    expect(getAdminRouteFromHash('#admin-grade')).toBe('/admin/jogos')
    expect(getAdminRouteFromHash('admin-espaco')).toBe('/admin/meu-espaco')
    expect(getAdminRouteFromHash('#admin-quem-vai')).toBe('/admin/quem-vai')
    expect(getAdminRouteFromHash('#admin-configuracoes')).toBe(
      '/admin/configuracoes'
    )
  })

  test('hash que não é de aba fica onde está', () => {
    expect(getAdminRouteFromHash('#configuracoes')).toBeNull()
    expect(getAdminRouteFromHash('')).toBeNull()
  })
})
