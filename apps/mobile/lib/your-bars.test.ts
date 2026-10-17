import { describe, expect, it } from 'bun:test'
import {
  byMonth,
  dayMonth,
  gameWhen,
  savedWeek,
  visitGrid,
  weekOf
} from './your-bars'

// Sábado, 17/10/2026, 19h30 em Brasília.
const now = Date.parse('2026-10-17T22:30:00Z')
const at = (iso: string) => ({ startsAt: iso, endsAt: null })

describe('seus bares', () => {
  it('a semana vai de segunda a domingo', () => {
    const days = weekOf(now).map((d) =>
      new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    )
    expect(days[0]).toBe('12/10/2026')
    expect(days[6]).toBe('18/10/2026')
  })

  it('o calendário marca o dia da visita na semana certa', () => {
    const grid = visitGrid(
      [at('2026-10-14T22:00:00Z'), at('2026-09-28T23:30:00Z')],
      now
    )
    expect(grid[3]?.[2]?.on).toBe(true) // quarta desta semana
    expect(grid[1]?.[0]?.on).toBe(true) // segunda, duas semanas antes
    expect(grid.flat().filter((d) => d.on)).toHaveLength(2)
  })

  it('visitas por mês e data curta', () => {
    const groups = byMonth([
      at('2026-10-04T22:00:00Z'),
      at('2026-09-28T23:30:00Z')
    ])
    expect(groups.map((g) => g.label)).toEqual(['Outubro', 'Setembro'])
    expect(dayMonth('2026-10-04T22:00:00Z')).toEqual({
      day: '04',
      month: 'OUT'
    })
  })

  it('a semana dos salvos agrupa por dia e separa quem não tem jogo', () => {
    const saved = [
      {
        barId: 'a',
        bar: {
          name: 'Bar do Zé',
          neighborhood: 'Vila Madalena',
          events: [at('2026-10-17T22:00:00Z')]
        }
      },
      {
        barId: 'b',
        bar: {
          name: 'Empório',
          neighborhood: 'Pinheiros',
          events: [at('2026-10-18T19:00:00Z')]
        }
      },
      {
        barId: 'c',
        bar: {
          name: 'Pirajá',
          neighborhood: 'Pinheiros',
          events: [at('2026-10-25T19:00:00Z')]
        }
      }
    ]
    const week = savedWeek(saved, now)
    expect(week.groups.map((g) => g.label)).toEqual(['Hoje', 'Amanhã'])
    expect(week.today).toBe(1)
    expect(week.idle.map((s) => s.barId)).toEqual(['c'])
  })

  it('jogo ao vivo é AGORA; outro dia leva o dia', () => {
    expect(gameWhen(at('2026-10-17T22:00:00Z'), now).time).toBe('AGORA')
    expect(gameWhen(at('2026-10-18T19:00:00Z'), now)).toEqual({
      live: false,
      time: '16:00',
      day: 'DOM 18'
    })
  })
})
