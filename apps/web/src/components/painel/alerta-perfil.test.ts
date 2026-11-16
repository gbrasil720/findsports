import { describe, expect, test } from 'bun:test'
import { PROFILE_ALERTS } from '@findsports_oficial/db/profile-alerts'
import { ALERTA_TEXTO, diaDaVolta } from './alerta-perfil'

describe('alerta de perfil', () => {
  test('o X volta em 3 dias, no dia de Brasília', () => {
    expect(diaDaVolta(new Date('2026-11-16T15:00:00Z'))).toBe('19 nov')
    // 23h de 16/11 em Brasília já é 17/11 em UTC.
    expect(diaDaVolta(new Date('2026-11-17T02:00:00Z'))).toBe('19 nov')
    expect(diaDaVolta(new Date('2026-12-30T12:00:00Z'))).toBe('2 jan')
  })

  test('todo assunto da fila tem texto e campo em Meu espaço', () => {
    for (const alerta of PROFILE_ALERTS) {
      const a = ALERTA_TEXTO[alerta]
      expect(a.titulo && a.texto && a.acao && a.campo).toBeTruthy()
      expect(a.campo.startsWith('esp-')).toBe(true)
    }
  })
})
