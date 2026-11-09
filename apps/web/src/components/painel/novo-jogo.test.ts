import { expect, test } from 'bun:test'
import { avisoForaDoHorario } from './novo-jogo'

const brt = (iso: string) => new Date(`${iso}-03:00`)
const f = (opens: string, closes: string) => ({ opens, closes })
// Domingo a sábado; segunda fechada.
const ZE = [
  f('12:00', '22:00'),
  null,
  f('17:00', '00:00'),
  f('17:00', '00:00'),
  f('17:00', '01:00'),
  f('16:00', '02:00'),
  f('12:00', '02:00')
]

test('aviso do Novo jogo: fora da faixa ou em dia fechado (WEB-463)', () => {
  // Sexta 15:00: o bar abre às 16:00.
  expect(avisoForaDoHorario(ZE, brt('2026-10-23T15:00:00'))).toBe(
    'Fora do horário de funcionamento (sexta, 16:00 – 02:00). Dá para publicar mesmo assim.'
  )
  expect(avisoForaDoHorario(ZE, brt('2026-10-26T21:00:00'))).toBe(
    'Fora do horário de funcionamento (segunda, fechado). Dá para publicar mesmo assim.'
  )
  // Sábado 01:30 ainda é a sexta que virou: dentro.
  expect(avisoForaDoHorario(ZE, brt('2026-10-24T01:30:00'))).toBeNull()
  expect(avisoForaDoHorario(null, brt('2026-10-26T21:00:00'))).toBeNull()
})
