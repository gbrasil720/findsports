import { describe, expect, test } from 'bun:test'

import { roleAccountLabel, roleLabel, rolePluralLabel } from './roles'

describe('taxonomia de papéis', () => {
  test('o mesmo papel tem um nome só em cada forma', () => {
    expect(roleLabel('pub')).toBe('Bar')
    expect(rolePluralLabel('pub')).toBe('Bares')
    expect(roleAccountLabel('pub')).toBe('Conta de bar')

    expect(roleLabel('fan')).toBe('Torcedor')
    expect(rolePluralLabel('fan')).toBe('Torcedores')
    expect(roleAccountLabel('fan')).toBe('Conta de torcedor')
  })

  test('papel desconhecido volta cru em vez de virar "Bar"', () => {
    // O `roleLabel` antigo era `role === 'fan' ? ... : 'Bar / Pub'`: qualquer
    // papel novo — inclusive `admin` — era rotulado como bar.
    expect(roleLabel('moderator')).toBe('moderator')
    expect(roleLabel('admin')).toBe('Admin')
  })
})
