import { describe, expect, test } from 'bun:test'
import { groupSuggestions, type SuggestionRow } from './nearby-bars'

const row = (
  barId: string,
  startsAt: string,
  title: string,
  extra: Partial<SuggestionRow> = {}
): SuggestionRow => ({
  bar_id: barId,
  sport_id: 'futebol',
  championship: 'Brasileirão',
  starts_at: startsAt,
  participant_free_text: null,
  participant_ids: ['a', 'b'],
  title,
  ...extra
})

describe('sugestões de jogos dos bares perto', () => {
  test('o mesmo jogo em vários bares é uma sugestão só', () => {
    const got = groupSuggestions(
      [
        row('outro-1', '2026-11-08 22:00:00', 'Corinthians × Palmeiras'),
        row('outro-2', '2026-11-08 22:00:00', 'Corinthians × Palmeiras')
      ],
      { barId: 'meu', limit: 6 }
    )
    expect(got).toEqual([
      {
        key: '2026-11-08T22:00:00.000Z|Corinthians × Palmeiras',
        title: 'Corinthians × Palmeiras',
        sportId: 'futebol',
        championship: 'Brasileirão',
        startsAt: '2026-11-08T22:00:00.000Z',
        participantIds: ['a', 'b'],
        participantFreeText: null
      }
    ])
  })

  test('o jogo que o bar já tem não volta', () => {
    const got = groupSuggestions(
      [
        row('outro', '2026-11-08 22:00:00', 'Corinthians × Palmeiras'),
        row('meu', '2026-11-08 22:00:00', 'Corinthians × Palmeiras'),
        row('outro', '2026-11-09 10:00:00', 'GP de Las Vegas', {
          participant_ids: null,
          participant_free_text: 'GP de Las Vegas'
        })
      ],
      { barId: 'meu', limit: 6 }
    )
    expect(got.map((g) => g.title)).toEqual(['GP de Las Vegas'])
    expect(got[0]).toMatchObject({
      participantIds: [],
      participantFreeText: 'GP de Las Vegas'
    })
  })

  test('acima do limite ficam os que mais bares marcaram, na ordem do início', () => {
    const got = groupSuggestions(
      [
        row('x', '2026-11-08 10:00:00', 'Cedo e sozinho'),
        row('x', '2026-11-08 20:00:00', 'Tarde e cheio'),
        row('y', '2026-11-08 20:00:00', 'Tarde e cheio'),
        row('y', '2026-11-08 15:00:00', 'Meio e cheio'),
        row('z', '2026-11-08 15:00:00', 'Meio e cheio')
      ],
      { barId: 'meu', limit: 2 }
    )
    expect(got.map((g) => g.title)).toEqual(['Meio e cheio', 'Tarde e cheio'])
  })
})
