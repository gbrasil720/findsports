import { describe, expect, test } from 'bun:test'
import { getEventEnd } from '@findsports_oficial/db/event-window'
import { CHECK_IN_RADIUS_M } from '@findsports_oficial/db/rating-limits'
import { checkInRefusal, formatDistance } from './check-in'

const HOUR = 3_600_000
const startsAt = new Date('2026-10-28T23:30:00Z')
const game = { startsAt, endsAt: null }
const end = getEventEnd(game)
const at = (ms: number) => new Date(ms)

describe('checkInRefusal (WEB-408)', () => {
  test('no bar, durante o jogo: vale', () => {
    expect(
      checkInRefusal({
        event: game,
        distanceM: 40,
        now: at(startsAt.getTime() + HOUR)
      })
    ).toBeNull()
  })

  test('o raio é inclusivo: 150 m vale, 151 m não', () => {
    const now = at(startsAt.getTime())
    expect(
      checkInRefusal({ event: game, distanceM: CHECK_IN_RADIUS_M, now })
    ).toBeNull()
    expect(
      checkInRefusal({ event: game, distanceM: CHECK_IN_RADIUS_M + 1, now })
    ).toBe(
      'Você está a 160 m do bar. Chegue a até 150 m para fazer o check-in.'
    )
  })

  test('a janela é a do código: 3 h antes a 3 h depois do fim', () => {
    const opens = startsAt.getTime() - 3 * HOUR
    const closes = end.getTime() + 3 * HOUR
    const refusalAt = (ms: number) =>
      checkInRefusal({ event: game, distanceM: 0, now: at(ms) })
    expect(refusalAt(opens)).toBeNull()
    expect(refusalAt(closes)).toBeNull()
    expect(refusalAt(opens - 1)).toBe('O check-in abre 3 h antes do jogo.')
    expect(refusalAt(closes + 1)).toBe('O check-in deste jogo já fechou.')
  })

  test('fora da janela vence a distância', () => {
    expect(
      checkInRefusal({
        event: game,
        distanceM: 5000,
        now: at(end.getTime() + 4 * HOUR)
      })
    ).toBe('O check-in deste jogo já fechou.')
  })
})

test('formatDistance arredonda para cima, de 10 em 10 m, e passa a km em 1000', () => {
  expect(formatDistance(151)).toBe('160 m')
  expect(formatDistance(997)).toBe('1 km')
  expect(formatDistance(2430)).toBe('2,4 km')
})
