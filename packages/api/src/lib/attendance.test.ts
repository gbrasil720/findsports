import { expect, test } from 'bun:test'
import { INTEREST_MIN_HISTORY, interestSignal } from './attendance'

const ended = (count: number, i: number) => ({
  eventId: `ended-${i}`,
  ended: true,
  count
})

test('sinal de interesse só existe com histórico suficiente', () => {
  const quiet = Array.from({ length: 10 }, (_, i) => ended(0, i))
  const short = Array.from({ length: INTEREST_MIN_HISTORY - 1 }, (_, i) =>
    ended(4, i)
  )
  expect(interestSignal([...quiet, ...short])).toEqual({ status: 'gathering' })
})

test('sinal compara o jogo com a média dos encerrados que tiveram presença', () => {
  const history = [2, 4, 4, 6, 4].map(ended)
  expect(
    interestSignal([
      ...history,
      ended(0, 99),
      { eventId: 'next', ended: false, count: 5 },
      { eventId: 'empty', ended: false, count: 0 }
    ])
  ).toEqual({
    status: 'ready',
    events: [
      { eventId: 'next', ratio: 1.3 },
      { eventId: 'empty', ratio: 0 }
    ]
  })
})
