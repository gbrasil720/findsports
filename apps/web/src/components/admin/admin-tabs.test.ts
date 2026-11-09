import { describe, expect, it } from 'bun:test'
import { ADMIN_SECTION_ROUTES, getAdminSectionFromHash } from './admin-tabs'

describe('links antigos do painel por hash', () => {
  it('reconhece a aba com ou sem #', () => {
    expect(getAdminSectionFromHash('#admin-grade')).toBe('admin-grade')
    expect(getAdminSectionFromHash('admin-espaco')).toBe('admin-espaco')
  })

  it('ignora hash que não é de aba', () => {
    expect(getAdminSectionFromHash('#reviews')).toBeNull()
    expect(getAdminSectionFromHash('')).toBeNull()
    expect(getAdminSectionFromHash('#constructor')).toBeNull()
  })

  it('cada aba vai para a rota nova', () => {
    expect(ADMIN_SECTION_ROUTES['admin-espaco']).toBe('/admin/meu-espaco')
    expect(ADMIN_SECTION_ROUTES['admin-grade']).toBe('/admin/jogos')
    expect(ADMIN_SECTION_ROUTES['admin-quem-vai']).toBe('/admin/quem-vai')
    expect(ADMIN_SECTION_ROUTES['admin-configuracoes']).toBe(
      '/admin/configuracoes'
    )
  })
})
