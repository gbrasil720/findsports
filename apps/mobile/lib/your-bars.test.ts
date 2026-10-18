import { describe, expect, it } from 'bun:test'
import {
  barGroups,
  byMonth,
  dayMonth,
  gameWhen,
  savedWeek,
  visitGrid,
  weekOf,
  yourBars
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

describe('aba Bares', () => {
  const bar = (name: string, neighborhood: string, lat: number) => ({
    name,
    neighborhood,
    photoUrl: null,
    latitude: String(lat),
    longitude: '-46.68'
  })
  const from = { lat: -23.56, lng: -46.68 }
  const km = (a: { lat: number }, b: { lat: number }) =>
    Math.abs(a.lat - b.lat) * 100

  it('só os salvos, com as visitas contadas, e o resumo por bairro', () => {
    const visit = (barId: string, b: ReturnType<typeof bar>) => ({
      ...b,
      barId,
      barName: b.name,
      barActive: true
    })
    const zé = bar('Bar do Zé', 'Vila Madalena', -23.561)
    const casa = bar('Casa 92', 'Pinheiros', -23.57)
    const sete = bar('Boteco Sete', 'Pinheiros', -23.58)
    const result = yourBars(
      [visit('ze', zé), visit('ze', zé), visit('sete', sete)],
      [
        { barId: 'ze', bar: zé },
        { barId: 'casa', bar: casa }
      ],
      from,
      km
    )
    const ze = result.bars.find((b) => b.barId === 'ze')
    expect(ze).toMatchObject({ visits: 2, saved: true })
    // Visitado e não salvo não entra.
    expect(result.bars.find((b) => b.barId === 'sete')).toBeUndefined()
    expect(result.bars.find((b) => b.barId === 'casa')).toMatchObject({
      visits: 0
    })
    expect(result.neighborhoods).toEqual([
      { name: 'Pinheiros', count: 1 },
      { name: 'Vila Madalena', count: 1 }
    ])
    expect(result.nearest).toBeCloseTo(0.1)
    const groups = barGroups(result.bars, result.neighborhoods, 'bairro')
    expect(groups[0]?.bars.map((b) => b.name)).toEqual(['Casa 92'])
  })
})
