import { expect, test } from 'bun:test'

import { nowLine, when } from './format'

test('nowLine escreve o dia e a hora de Brasília como no design', () => {
  // 00:47 UTC do dia 23 ainda é 22 em Brasília.
  expect(nowLine(new Date('2026-10-23T00:47:00Z'))).toBe(
    'Qui, 22 out · 21:47 em Brasília'
  )
})

test('when diz hoje, ontem ou a data, pelo calendário de Brasília', () => {
  const now = new Date('2026-10-22T23:00:00Z') // 20:00 em Brasília
  expect(when(new Date('2026-10-22T13:05:00Z'), now)).toBe('hoje 10:05')
  expect(when(new Date('2026-10-22T02:30:00Z'), now)).toBe('ontem 23:30')
  expect(when(new Date('2026-10-12T12:00:00Z'), now)).toBe('12/10 09:00')
})
