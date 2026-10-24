import { describe, expect, test } from 'bun:test'

import { getAdminSectionFromHash, getAdminSections } from './admin-tabs'

describe('admin tabs', () => {
  test('recognizes the settings hash as a real admin tab', () => {
    expect(getAdminSectionFromHash('#admin-configuracoes')).toBe(
      'admin-configuracoes'
    )
  })

  test('restores valid deep links and rejects unrelated hashes', () => {
    expect(getAdminSectionFromHash('#admin-grade')).toBe('admin-grade')
    expect(getAdminSectionFromHash('admin-espaco')).toBe('admin-espaco')
    expect(getAdminSectionFromHash('#configuracoes')).toBeNull()
  })

  test('shows the reservations tab only to bars that receive or still owe reservations', () => {
    const ids = (shows: boolean) =>
      getAdminSections(shows).map((section) => section.id)
    expect(ids(true)).toContain('admin-quem-vai')
    expect(ids(false)).not.toContain('admin-quem-vai')
    expect(ids(false)).toContain('admin-configuracoes')
  })
})
