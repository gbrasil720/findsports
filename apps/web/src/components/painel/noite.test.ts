import { expect, test } from 'bun:test'
import type { AdminEvent } from '@/components/admin/admin-model'
import {
  brasiliaTime,
  countdown,
  dayLabel,
  houseDay,
  inLabel,
  longDayLabel,
  nightRule,
  relativeDayLabel,
  weekDays
} from './noite'

const game = (startsAt: string, endsAt: string | null = null) =>
  ({ id: startsAt, startsAt, endsAt }) as unknown as AdminEvent

test('hora e dia são os de Brasília, e o dia da casa vira às 6h', () => {
  // 01:30 de sexta em Brasília (04:30 UTC) ainda é a noite de quinta.
  expect(brasiliaTime('2026-11-06T04:30:00Z')).toBe('01:30')
  expect(houseDay('2026-11-06T04:30:00Z')).toBe('2026-11-05')
  expect(houseDay('2026-11-06T09:00:00Z')).toBe('2026-11-06')
  expect(dayLabel('2026-11-05')).toBe('qui, 5 nov')
  expect(longDayLabel('2026-11-05')).toBe('quinta, 5 nov')
  expect(relativeDayLabel('2026-11-06', '2026-11-05')).toBe(
    'Amanhã · sex, 6 nov'
  )
})

test('a semana vai de domingo a sábado', () => {
  expect(weekDays('2026-11-05')).toEqual([
    '2026-11-01',
    '2026-11-02',
    '2026-11-03',
    '2026-11-04',
    '2026-11-05',
    '2026-11-06',
    '2026-11-07'
  ])
  expect(weekDays('2026-11-05', 1)[0]).toBe('2026-11-08')
})

test('contagem do herói e da linha', () => {
  expect(countdown(48 * 60_000)).toBe('48min')
  expect(countdown(65 * 60_000)).toBe('1h05min')
  expect(inLabel(48 * 60_000)).toBe('48 min')
  expect(inLabel(125 * 60_000)).toBe('2h05')
})

test('a régua vai de 18h a 2h e estica para o jogo da tarde', () => {
  const now = Date.parse('2026-11-05T21:42:00Z') // 18:42
  const night = nightRule([game('2026-11-05T22:30:00Z')], now)
  expect(night.hours[0]?.hour).toBe(18)
  expect(night.hours.at(-1)?.hour).toBe(2)
  expect(night.tracks[0]?.left).toBeCloseTo(18.75) // 19:30 de 18h a 2h
  expect(night.nowAt).toBeCloseTo((42 / 480) * 100)

  const afternoon = nightRule(
    [game('2026-11-05T19:00:00Z'), game('2026-11-05T20:00:00Z')],
    now
  )
  expect(afternoon.hours[0]?.hour).toBe(16)
  // Os dois se cruzam: cada um na sua faixa.
  expect(afternoon.tracks.map((t) => t.lane)).toEqual([0, 1])
  expect(afternoon.lanes).toBe(2)
})
