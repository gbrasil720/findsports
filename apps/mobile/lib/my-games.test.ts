import { describe, expect, test } from 'bun:test'
import {
  calendarEvent,
  formatCode,
  pastLabel,
  pickTodayCode,
  shortDate,
  showsCheckIn,
  thisMonth,
  todayHeadline
} from './my-games'

test('o código sai em dois blocos', () => {
  expect(formatCode('A7K29X')).toBe('A7K·29X')
})

test('validado vence; código não usado é não validado; sem código, encerrado', () => {
  expect(pastLabel({ validated: true, missed: false, visited: true })).toBe(
    'Validado'
  )
  expect(pastLabel({ validated: false, missed: true, visited: false })).toBe(
    'Não validado'
  )
  expect(pastLabel({ validated: false, missed: false, visited: false })).toBe(
    'Jogo encerrado'
  )
})

test('o check-in confirma a presença mesmo com o código não validado', () => {
  expect(pastLabel({ validated: false, missed: true, visited: true })).toBe(
    'Presença confirmada'
  )
})

test('"Estou aqui" aparece de 3 h antes do jogo a 3 h depois do fim, com o bar no ar', () => {
  const game = {
    startsAt: '2026-10-29T22:00:00Z',
    endsAt: '2026-10-30T00:00:00Z',
    barActive: true
  }
  const at = (iso: string) => showsCheckIn(game, Date.parse(iso))
  expect(at('2026-10-29T18:59:00Z')).toBe(false)
  expect(at('2026-10-29T19:00:00Z')).toBe(true)
  expect(at('2026-10-29T23:00:00Z')).toBe(true)
  // Acabou há pouco: o jogo já está em "Anteriores" e o check-in ainda vale.
  expect(at('2026-10-30T03:00:00Z')).toBe(true)
  expect(at('2026-10-30T03:01:00Z')).toBe(false)
  expect(
    showsCheckIn(
      { ...game, barActive: false },
      Date.parse('2026-10-29T23:00:00Z')
    )
  ).toBe(false)
})

test('a data curta é a do horário de Brasília', () => {
  // 02:00 UTC do dia 5 ainda é dia 4 em Brasília.
  expect(shortDate('2026-10-05T02:00:00Z')).toBe('4 out')
})

test('conta só os jogos do mês corrente', () => {
  const now = Date.parse('2026-10-16T15:00:00Z')
  expect(
    thisMonth(
      [
        { startsAt: '2026-10-04T21:00:00Z' },
        { startsAt: '2026-10-10T21:00:00Z' },
        { startsAt: '2026-09-28T21:00:00Z' }
      ],
      now
    )
  ).toBe('2 em outubro')
  expect(thisMonth([{ startsAt: '2026-09-28T21:00:00Z' }], now)).toBeNull()
})

test('o jogo vira evento da agenda com o bar e o código', () => {
  const event = calendarEvent({
    participants: ['Corinthians', 'Palmeiras'],
    participantFreeText: null,
    championship: 'Brasileirão',
    barName: 'Bar do Zé',
    neighborhood: 'Vila Madalena',
    startsAt: '2026-10-18T00:30:00.000Z',
    endsAt: '2026-10-18T03:30:00.000Z',
    code: 'A7K29X',
    offer: 'Chopp em dobro até o intervalo.'
  })
  expect(event.title).toBe('Corinthians × Palmeiras no Bar do Zé')
  expect(event.location).toBe('Bar do Zé, Vila Madalena')
  expect(event.endDate.toISOString()).toBe('2026-10-18T03:30:00.000Z')
  expect(event.notes).toBe(
    'Código no balcão: A7K·29X\nOferta da casa: Chopp em dobro até o intervalo.'
  )
})

test('sem código nem oferta, o evento sai sem notas', () => {
  const event = calendarEvent({
    participants: [],
    participantFreeText: null,
    championship: 'NBA',
    barName: 'Casa 92',
    neighborhood: '',
    startsAt: '2026-10-18T00:30:00.000Z',
    endsAt: '2026-10-18T02:00:00.000Z',
    code: null,
    offer: null
  })
  expect(event.title).toBe('NBA no Casa 92')
  expect(event.location).toBe('Casa 92')
  expect(event.endDate.toISOString()).toBe('2026-10-18T02:00:00.000Z')
  expect(event.notes).toBeUndefined()
})

test('código de hoje: janela aberta, o que falta validar antes, o jogo mais cedo', () => {
  const now = Date.parse('2026-10-28T22:00:00Z')
  const game = (
    code: string | null,
    startsAt: string,
    closesAt: string,
    validated = false
  ) => ({
    code,
    validated,
    startsAt,
    window: { opensAt: startsAt, closesAt }
  })
  const late = game('LATE01', '2026-10-29T00:30:00Z', '2026-10-29T04:00:00Z')
  const early = game('EARLY1', '2026-10-28T23:00:00Z', '2026-10-29T02:00:00Z')
  const done = game(
    'DONE01',
    '2026-10-28T21:00:00Z',
    '2026-10-29T01:00:00Z',
    true
  )
  const closed = game('OLD001', '2026-10-27T21:00:00Z', '2026-10-28T01:00:00Z')
  const noCode = game(null, '2026-10-28T22:30:00Z', '2026-10-29T02:00:00Z')

  expect(pickTodayCode([late, done, early, closed, noCode], now)).toBe(early)
  expect(pickTodayCode([done, closed], now)).toBe(done)
  expect(pickTodayCode([closed, noCode], now)).toBeNull()
  expect(pickTodayCode([], now)).toBeNull()
})

describe('todayHeadline', () => {
  test('o jogo que mais bares passam, e o primeiro no empate', () => {
    const at = '2026-10-30T00:30:00.000Z'
    const early = '2026-10-29T22:00:00.000Z'
    expect(
      todayHeadline([
        { title: 'Lakers × Celtics', startsAt: early },
        { title: 'Corinthians × Palmeiras', startsAt: at },
        { title: 'Corinthians × Palmeiras', startsAt: at }
      ])
    ).toEqual({ title: 'Corinthians × Palmeiras', startsAt: at, bars: 2 })
    expect(
      todayHeadline([
        { title: 'B', startsAt: at },
        { title: 'A', startsAt: early }
      ])
    ).toMatchObject({ title: 'A' })
    expect(todayHeadline([])).toBeNull()
  })
})
