import { describe, expect, it } from 'bun:test'
import { feedOf } from './friend-activity'

const now = new Date('2026-11-10T23:00:00Z')
const marina = { id: 'm', name: 'Marina', image: null }
const visit = (iso: string, barId: string, bairro = 'Pinheiros') => ({
  userId: 'm',
  at: new Date(iso),
  barId,
  barName: `Bar ${barId}`,
  neighborhood: bairro,
  city: 'São Paulo',
  sportId: 's',
  sportName: 'Futebol'
})

describe('feedOf (rodada 6)', () => {
  it('a visita, a medalha e o nível que ela fechou, o mais novo primeiro', () => {
    const feed = feedOf([marina], [visit('2026-11-09T22:00:00Z', 'a')], [], now)
    expect(feed.map((item) => item.kind).sort()).toEqual([
      'level',
      'medal',
      'visit'
    ])
    const level = feed.find((item) => item.kind === 'level')
    expect(level && 'level' in level ? level.level : null).toBe(2)
  })
  it('fora das duas semanas não entra', () => {
    expect(
      feedOf([marina], [visit('2026-10-01T22:00:00Z', 'a')], [], now)
    ).toEqual([])
  })
})
