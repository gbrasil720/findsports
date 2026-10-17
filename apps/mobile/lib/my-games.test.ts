import { expect, test } from 'bun:test'
import {
  calendarEvent,
  formatCode,
  gameTitle,
  pastLabel,
  shortDate,
  thisMonth
} from './my-games'

test('o código sai em dois blocos', () => {
  expect(formatCode('A7K29X')).toBe('A7K·29X')
})

test('o jogo é nomeado pelos times, senão pelo texto, senão pelo campeonato', () => {
  const base = { participantFreeText: null, championship: 'Brasileirão' }
  expect(gameTitle({ ...base, participants: ['Grêmio', 'Inter'] })).toBe(
    'Grêmio × Inter'
  )
  expect(
    gameTitle({ ...base, participants: [], participantFreeText: 'UFC 300' })
  ).toBe('UFC 300')
  expect(gameTitle({ ...base, participants: [] })).toBe('Brasileirão')
})

test('validado vence; código não usado é não validado; sem código, encerrado', () => {
  expect(pastLabel({ validated: true, missed: false })).toBe('Validado')
  expect(pastLabel({ validated: false, missed: true })).toBe('Não validado')
  expect(pastLabel({ validated: false, missed: false })).toBe('Jogo encerrado')
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
