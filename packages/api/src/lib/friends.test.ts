import { describe, expect, test } from 'bun:test'
import {
  canSeeActivity,
  friendCodeFrom,
  monthStart,
  normalizeFriendCode,
  normalizeUsername,
  relationOf,
  USERNAME_PATTERN,
  usernameFrom
} from './friends'

describe('amigos', () => {
  test('@ nasce do primeiro e do último nome, sem acento', () => {
    expect(usernameFrom('Marina Costa')).toBe('marinacosta')
    expect(usernameFrom('João da Silva Ávila')).toBe('joaoavila')
    expect(usernameFrom('Zé')).toBe('torcedorze')
    expect(usernameFrom('Maria Aparecida Conceição dos Santos Oliveira')).toBe(
      'mariaoliveira'
    )
    for (const name of ['Marina Costa', 'Zé', '李', 'Ana-Luiza Prado'])
      expect(USERNAME_PATTERN.test(usernameFrom(name))).toBe(true)
  })

  test('código: iniciais e quatro números', () => {
    expect(friendCodeFrom('Gabriel Brasil', 4821)).toBe('GB-4821')
    expect(friendCodeFrom('Zé', 7)).toBe('ZE-0007')
    expect(friendCodeFrom('李', 12)).toBe('ON-0012')
    expect(normalizeFriendCode(' gb-4821 ')).toBe('GB-4821')
    expect(normalizeUsername(' @MarinaC ')).toBe('marinac')
  })

  test('relação e o que cada um vê', () => {
    const pending = { requesterId: 'a', acceptedAt: null }
    expect(relationOf('a', 'a', null)).toBe('self')
    expect(relationOf('a', 'b', null)).toBe('none')
    expect(relationOf('a', 'b', pending)).toBe('sent')
    expect(relationOf('b', 'a', pending)).toBe('received')
    expect(relationOf('a', 'b', { ...pending, acceptedAt: new Date() })).toBe(
      'friends'
    )
    expect(canSeeActivity('friends', 'friends')).toBe(true)
    expect(canSeeActivity('friends', 'sent')).toBe(false)
    expect(canSeeActivity('nobody', 'friends')).toBe(false)
    expect(canSeeActivity('nobody', 'self')).toBe(true)
    expect(canSeeActivity('everyone', 'none')).toBe(true)
  })

  test('mês de Brasília', () => {
    // 1º de novembro à 01:00 em Brasília (04:00 UTC): novembro.
    expect(monthStart(new Date('2026-11-01T04:00:00Z')).toISOString()).toBe(
      '2026-11-01T03:00:00.000Z'
    )
    // 31 de outubro às 23:00 em Brasília já é novembro em UTC.
    expect(monthStart(new Date('2026-11-01T02:00:00Z')).toISOString()).toBe(
      '2026-10-01T03:00:00.000Z'
    )
  })
})
