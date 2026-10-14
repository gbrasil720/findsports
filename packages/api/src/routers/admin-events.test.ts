import { describe, expect, it } from 'bun:test'

import { suggestTeams } from './admin-events'

const CATALOG = [
  { id: 'fla', name: 'Flamengo' },
  { id: 'sao', name: 'São Paulo' },
  { id: 'atl-1', name: 'Atlético' },
  { id: 'atl-2', name: 'Atlético' }
]

describe('suggestTeams', () => {
  it('casa sem acento nem caixa, nos separadores de confronto', () => {
    for (const text of [
      'flamengo x sao paulo',
      'Flamengo × São Paulo',
      'FLAMENGO vs São  Paulo',
      'Flamengo - Sao Paulo'
    ]) {
      expect(suggestTeams(text, CATALOG)?.map((t) => t.id)).toEqual([
        'fla',
        'sao'
      ])
    }
    expect(suggestTeams('  Flamengo ', CATALOG)?.map((t) => t.id)).toEqual([
      'fla'
    ])
  })

  it('não sugere quando há dúvida', () => {
    expect(suggestTeams('Fla x São Paulo', CATALOG)).toBeNull()
    expect(suggestTeams('Atlético x Flamengo', CATALOG)).toBeNull()
    expect(suggestTeams('Flamengo x Flamengo', CATALOG)).toBeNull()
    expect(suggestTeams('Flamengo x São Paulo x Flamengo', CATALOG)).toBeNull()
    expect(suggestTeams('classificatória', CATALOG)).toBeNull()
  })
})
