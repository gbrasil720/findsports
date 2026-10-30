import { describe, expect, test } from 'bun:test'
import {
  gameToday,
  levelLine,
  markedToday,
  memberSince,
  nextInSaved,
  topBars,
  yourBarCount
} from './profile'

// 20/10/2026, 12:00 em Brasília.
const NOW = Date.parse('2026-10-20T15:00:00Z')

describe('perfil (2l)', () => {
  test('torcedor desde o mês do cadastro', () => {
    expect(memberSince('2026-09-14T15:00:00Z')).toBe('torcedor desde set. 2026')
  })

  test('seus bares conta cada bar uma vez, visitado ou salvo', () => {
    expect(
      yourBarCount(
        [{ barId: 'a' }, { barId: 'a' }, { barId: 'b' }],
        [{ barId: 'b' }, { barId: 'c' }]
      )
    ).toBe(3)
  })

  test('jogo marcado hoje é o do dia de Brasília', () => {
    expect(
      markedToday(
        [
          { startsAt: '2026-10-21T00:30:00Z' }, // 20/10, 21:30 em Brasília
          { startsAt: '2026-10-21T03:30:00Z' }, // já 21/10
          { startsAt: '2026-10-19T22:00:00Z' }
        ],
        NOW
      )
    ).toBe(1)
  })

  test('próximos jogos dos salvos, do mais perto ao mais longe', () => {
    const game = (id: string, startsAt: string) => ({
      id,
      startsAt,
      sport: { name: 'Futebol' }
    })
    const rows = nextInSaved(
      [
        {
          barId: 'a',
          bar: {
            name: 'Bar do Zé',
            photoUrl: null,
            events: [game('1', '2026-10-21T00:30:00Z')]
          }
        },
        {
          barId: 'b',
          bar: {
            name: 'Boteco Sete',
            photoUrl: null,
            events: [
              game('2', '2026-10-20T22:00:00Z'),
              game('3', '2026-10-22T22:00:00Z')
            ]
          }
        }
      ],
      2
    )
    expect(rows.map((r) => r.game.id)).toEqual(['2', '1'])
    expect(rows[0]?.barName).toBe('Boteco Sete')
  })

  test('bares que mais foi: o mês, senão ao todo', () => {
    const visit = (barId: string, startsAt: string) => ({
      barId,
      barName: `Bar ${barId}`,
      photoUrl: null,
      startsAt
    })
    const month = topBars(
      [
        visit('a', '2026-10-02T22:00:00Z'),
        visit('b', '2026-10-05T22:00:00Z'),
        visit('b', '2026-10-12T22:00:00Z'),
        visit('c', '2026-09-30T22:00:00Z')
      ],
      NOW
    )
    expect(month.label).toBe('outubro')
    expect(month.bars.map((b) => [b.barId, b.games])).toEqual([
      ['b', 2],
      ['a', 1]
    ])

    const before = topBars([visit('c', '2026-09-30T22:00:00Z')], NOW)
    expect(before.label).toBe('ao todo')
    expect(before.bars.map((b) => b.barId)).toEqual(['c'])
  })

  test('tela de fora: o jogo de hoje que não acabou, o mais cedo', () => {
    const game = (id: string, startsAt: string, ended = false) => ({
      id,
      startsAt,
      ended
    })
    expect(
      gameToday(
        [
          game('noite', '2026-10-20T23:30:00Z'),
          game('tarde', '2026-10-20T19:00:00Z'),
          game('cedo', '2026-10-20T13:00:00Z', true),
          game('amanha', '2026-10-21T19:00:00Z')
        ],
        NOW
      )?.id
    ).toBe('tarde')
    expect(gameToday([game('amanha', '2026-10-21T19:00:00Z')], NOW)).toBeNull()
  })

  test('linha do nível com o caminho até o próximo', () => {
    expect(levelLine({ level: 4, unlocked: 5, nextAt: 8 })).toBe(
      'NÍVEL 4 · 5/8'
    )
    expect(levelLine({ level: 5, unlocked: 9, nextAt: null })).toBe('NÍVEL 5')
  })
})
