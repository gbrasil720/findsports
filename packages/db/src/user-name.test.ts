import { describe, expect, test } from 'bun:test'
import { USER_NAME_MAX, userNameRefusal } from './user-name'

describe('userNameRefusal', () => {
  test('aceita nome comum, com acento e espaço nas pontas', () => {
    expect(userNameRefusal('  João da Silva  ')).toBeNull()
    expect(userNameRefusal('Ana Luíza D’Ávila')).toBeNull()
    expect(userNameRefusal('a'.repeat(USER_NAME_MAX))).toBeNull()
  })

  test('recusa vazio e longo demais', () => {
    expect(userNameRefusal('   ')).toBe('Informe seu nome.')
    expect(userNameRefusal('a'.repeat(USER_NAME_MAX + 1))).toBe(
      'O nome pode ter até 80 caracteres.'
    )
  })

  test('recusa quebra de linha, controle e bidi', () => {
    // Por código: o Biome troca o escape pelo caractere invisível.
    const invisible = [0x202e, 0x2066, 0x2028].map(
      (code) => `A${String.fromCodePoint(code)}b`
    )
    for (const name of ['Ana\nClique', 'Ana\r\nX', 'Ana\tB', ...invisible])
      expect(userNameRefusal(name)).toBe(
        'O nome não pode ter quebra de linha nem caracteres especiais.'
      )
  })

  test('recusa endereço de site', () => {
    for (const name of [
      'Ana https://golpe.com',
      'Ana WWW.golpe.com',
      'hxxp://x'
    ])
      expect(userNameRefusal(name)).toBe(
        'O nome não pode ter endereço de site.'
      )
  })
})
