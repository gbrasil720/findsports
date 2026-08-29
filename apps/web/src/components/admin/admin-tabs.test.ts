import { describe, expect, test } from 'bun:test'

import { getAdminSectionFromHash, getNextAdminSection } from './admin-tabs'

describe('admin tabs keyboard navigation', () => {
  test('moves through adjacent tabs and wraps at both ends', () => {
    expect(getNextAdminSection('admin-visao', 'ArrowRight')).toBe('admin-grade')
    expect(getNextAdminSection('admin-grade', 'ArrowDown')).toBe('admin-espaco')
    expect(getNextAdminSection('admin-espaco', 'ArrowRight')).toBe(
      'admin-configuracoes'
    )
    expect(getNextAdminSection('admin-configuracoes', 'ArrowRight')).toBe(
      'admin-visao'
    )
    expect(getNextAdminSection('admin-visao', 'ArrowLeft')).toBe(
      'admin-configuracoes'
    )
  })

  test('recognizes the settings hash as a real admin tab', () => {
    expect(getAdminSectionFromHash('#admin-configuracoes')).toBe(
      'admin-configuracoes'
    )
  })

  test('supports Home and End without intercepting unrelated keys', () => {
    expect(getNextAdminSection('admin-grade', 'Home')).toBe('admin-visao')
    expect(getNextAdminSection('admin-grade', 'End')).toBe(
      'admin-configuracoes'
    )
    expect(getNextAdminSection('admin-grade', 'Tab')).toBeNull()
  })

  test('restores valid deep links and rejects unrelated hashes', () => {
    expect(getAdminSectionFromHash('#admin-grade')).toBe('admin-grade')
    expect(getAdminSectionFromHash('admin-espaco')).toBe('admin-espaco')
    expect(getAdminSectionFromHash('#configuracoes')).toBeNull()
  })
})
