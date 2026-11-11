import { describe, expect, it } from 'bun:test'
import {
  computeAchievements,
  levelFor,
  type Visit,
  weekStreak
} from './achievements'
import { sharePercent } from './achievements-read'

const day = (n: number) => new Date(Date.UTC(2026, 8, n, 22))
const visit = (
  n: number,
  barId: string,
  extra: Partial<Visit> = {}
): Visit => ({
  at: day(n),
  barId,
  barName: `Bar ${barId}`,
  neighborhood: 'Pinheiros',
  city: 'São Paulo',
  sportId: 'futebol',
  sportName: 'Futebol',
  ...extra
})
const byId = (list: ReturnType<typeof computeAchievements>, id: string) =>
  list.find((a) => a.id === id)

describe('computeAchievements', () => {
  it('a medalha fica com a data e o bar de quem completou o alvo', () => {
    const visits = [5, 1, 3, 2, 4].map((n) => visit(n, `b${n}`))
    const bar5 = byId(computeAchievements(visits, []), 'bar5')
    expect(bar5?.progress).toBe(5)
    expect(bar5?.unlockedAt).toEqual(day(5))
    expect(bar5?.where).toBe('Bar b5')
  })

  it('voltar ao mesmo bar não conta bar novo', () => {
    const visits = [visit(1, 'a'), visit(2, 'a'), visit(3, 'b')]
    const list = computeAchievements(visits, [])
    expect(byId(list, 'bar1')?.unlockedAt).toEqual(day(1))
    expect(byId(list, 'bar5')?.progress).toBe(2)
    expect(byId(list, 'bar5')?.unlockedAt).toBeNull()
  })

  it('bairro de mesmo nome em outra cidade é outro bairro', () => {
    const visits = [
      visit(1, 'a', { neighborhood: 'Centro', city: 'São Paulo' }),
      visit(2, 'b', { neighborhood: 'Centro', city: 'Campinas' }),
      visit(3, 'c', { neighborhood: 'Centro', city: 'Campinas' })
    ]
    expect(byId(computeAchievements(visits, []), 'bai3')?.progress).toBe(2)
  })

  it('esporte leva o nome do esporte e do bar', () => {
    const visits = [
      visit(1, 'a'),
      visit(2, 'b', { sportId: 'nba', sportName: 'Basquete' })
    ]
    const esp2 = byId(computeAchievements(visits, []), 'esp2')
    expect(esp2?.where).toBe('Basquete · Bar b')
  })

  it('cada avaliação conta uma resenha', () => {
    const reviews = [3, 1, 2].map((n) => ({ at: day(n), barName: `R${n}` }))
    const list = computeAchievements([], reviews)
    expect(byId(list, 'ava1')?.where).toBe('R1')
    expect(byId(list, 'ava10')?.progress).toBe(3)
  })
})

describe('levelFor', () => {
  it('sobe pelo número de conquistas e diz quanto falta', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, nextAt: 1 })
    expect(levelFor(5)).toMatchObject({
      level: 4,
      name: 'Frequentador',
      nextAt: 8
    })
    expect(levelFor(10)).toMatchObject({ level: 5, nextAt: null })
  })
})

describe('sharePercent', () => {
  it('quem tem a medalha nunca aparece como 0%', () => {
    expect(sharePercent(1, 1000)).toBe(1)
    expect(sharePercent(0, 1000)).toBe(0)
    expect(sharePercent(12, 100)).toBe(12)
  })
})

describe('weekStreak', () => {
  // Quarta, 11/11/2026, 20:00 em Brasília.
  const now = new Date('2026-11-11T23:00:00Z')
  const at = (iso: string) => ({ at: new Date(iso) })
  it('conta as semanas seguidas, desta para trás', () => {
    expect(
      weekStreak(
        [
          at('2026-11-10T22:00:00Z'),
          at('2026-11-05T22:00:00Z'),
          at('2026-10-27T22:00:00Z')
        ],
        now
      )
    ).toBe(3)
  })
  it('sem visita nesta semana, começa na passada', () => {
    expect(weekStreak([at('2026-11-05T22:00:00Z')], now)).toBe(1)
  })
  it('um buraco quebra a sequência', () => {
    expect(
      weekStreak([at('2026-11-10T22:00:00Z'), at('2026-10-27T22:00:00Z')], now)
    ).toBe(1)
  })
  it('sem visita, zero', () => {
    expect(weekStreak([], now)).toBe(0)
  })
})
