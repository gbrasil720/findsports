import { describe, expect, test } from 'bun:test'
import {
  groupOpeningHours,
  isOpenNow,
  normalizeOpeningHours,
  type OpeningHours,
  openingHoursSchema,
  openingStatus
} from './opening-hours'

const day = (opens: string, closes: string) => ({ opens, closes })

/** A semana do design (2g): seg a qui 17–00, sex e sáb 17–02, domingo 12–22. */
const ZE: OpeningHours = [
  day('12:00', '22:00'),
  day('17:00', '00:00'),
  day('17:00', '00:00'),
  day('17:00', '00:00'),
  day('17:00', '00:00'),
  day('17:00', '02:00'),
  day('17:00', '02:00')
]

/** Horário de Brasília (UTC-3) escrito como instante UTC. */
const brt = (iso: string) => new Date(`${iso}-03:00`)

describe('isOpenNow', () => {
  // 23/10/2026 é sexta.
  test('dentro da faixa do dia', () => {
    expect(isOpenNow(ZE, brt('2026-10-23T18:00:00'))).toBe(true)
    expect(isOpenNow(ZE, brt('2026-10-23T16:59:00'))).toBe(false)
  })

  test('fechar à meia-noite é fechar no fim do dia', () => {
    // Quinta 23:59 aberto; sexta 00:00 já é sexta, que só abre às 17h.
    expect(isOpenNow(ZE, brt('2026-10-22T23:59:00'))).toBe(true)
    expect(isOpenNow(ZE, brt('2026-10-23T00:00:00'))).toBe(false)
  })

  test('faixa que vira a meia-noite segue aberta no dia seguinte', () => {
    // Sexta 17–02: sábado 01:30 ainda é a sexta; 02:00 fecha.
    expect(isOpenNow(ZE, brt('2026-10-24T01:30:00'))).toBe(true)
    expect(isOpenNow(ZE, brt('2026-10-24T02:00:00'))).toBe(false)
    // Sábado 17–02 vira para o domingo, que abre de novo ao meio-dia.
    expect(isOpenNow(ZE, brt('2026-10-25T01:00:00'))).toBe(true)
    expect(isOpenNow(ZE, brt('2026-10-25T11:00:00'))).toBe(false)
    expect(isOpenNow(ZE, brt('2026-10-25T12:00:00'))).toBe(true)
  })

  test('dia fechado depois de uma faixa que virou', () => {
    const hours: OpeningHours = [null, null, null, null, null, null, null]
    hours[5] = day('20:00', '03:00')
    expect(isOpenNow(hours, brt('2026-10-24T02:59:00'))).toBe(true)
    expect(isOpenNow(hours, brt('2026-10-24T20:00:00'))).toBe(false)
  })

  test('usa o relógio de Brasília, não o UTC', () => {
    // 02:30 UTC de sábado é 23:30 de sexta em Brasília: aberto.
    expect(isOpenNow(ZE, new Date('2026-10-24T02:30:00Z'))).toBe(true)
    // 20:30 UTC de domingo é 17:30 em Brasília: domingo fecha às 22h.
    expect(isOpenNow(ZE, new Date('2026-10-25T20:30:00Z'))).toBe(true)
    // 01:30 UTC de segunda é 22:30 de domingo: fechado.
    expect(isOpenNow(ZE, new Date('2026-10-26T01:30:00Z'))).toBe(false)
  })

  test('sem horário não diz nada', () => {
    expect(isOpenNow(null, new Date())).toBeNull()
  })
})

describe('groupOpeningHours', () => {
  test('dias seguidos iguais viram uma linha, como no design', () => {
    expect(groupOpeningHours(ZE)).toMatchObject([
      { days: 'Seg a qui', hours: '17:00 – 00:00' },
      { days: 'Sex e sáb', hours: '17:00 – 02:00' },
      { days: 'Domingo', hours: '12:00 – 22:00' }
    ])
  })

  test('dia fechado entra como fechado e quebra a sequência', () => {
    const hours: OpeningHours = [...ZE]
    hours[3] = null
    expect(groupOpeningHours(hours)).toMatchObject([
      { days: 'Seg e ter', hours: '17:00 – 00:00' },
      { days: 'Quarta', hours: null },
      { days: 'Quinta', hours: '17:00 – 00:00' },
      { days: 'Sex e sáb', hours: '17:00 – 02:00' },
      { days: 'Domingo', hours: '12:00 – 22:00' }
    ])
  })

  test('semana inteira igual', () => {
    const hours = Array.from({ length: 7 }, () => day('11:00', '23:00'))
    expect(groupOpeningHours(hours)).toMatchObject([
      { days: 'Seg a dom', hours: '11:00 – 23:00' }
    ])
  })
})

describe('openingHoursSchema', () => {
  test('aceita a semana e recusa faixa vazia ou hora inválida', () => {
    expect(openingHoursSchema.safeParse(ZE).success).toBe(true)
    expect(openingHoursSchema.safeParse(ZE.slice(1)).success).toBe(false)
    const same = [...ZE]
    same[0] = day('18:00', '18:00')
    expect(openingHoursSchema.safeParse(same).success).toBe(false)
    const bad = [...ZE]
    bad[0] = day('24:00', '02:00')
    expect(openingHoursSchema.safeParse(bad).success).toBe(false)
  })

  test('semana toda fechada é não informar', () => {
    expect(normalizeOpeningHours(Array(7).fill(null))).toBeNull()
    expect(normalizeOpeningHours(ZE)).toBe(ZE)
  })
})

describe('openingStatus', () => {
  // 24/10/2026 é sábado.
  test('aberto, com a hora de fechar e a faixa de hoje', () => {
    expect(openingStatus(ZE, brt('2026-10-24T20:00:00'))).toEqual({
      open: true,
      closes: '02:00',
      opens: null,
      today: 'sáb 17:00–02:00'
    })
  })
  test('madrugada da faixa de ontem fecha na hora de ontem', () => {
    expect(openingStatus(ZE, brt('2026-10-24T01:00:00'))).toMatchObject({
      open: true,
      closes: '02:00'
    })
  })
  test('fechado antes de abrir: abre hoje', () => {
    expect(openingStatus(ZE, brt('2026-10-24T10:00:00'))).toMatchObject({
      open: false,
      opens: { day: 'hoje', time: '17:00' }
    })
  })
  test('fechado depois de fechar: abre amanhã', () => {
    // Domingo 23h: fechou às 22h, segunda abre às 17h.
    expect(openingStatus(ZE, brt('2026-10-25T23:00:00'))).toMatchObject({
      open: false,
      opens: { day: 'amanhã', time: '17:00' }
    })
  })
  test('pula os dias fechados', () => {
    const soDomingo: OpeningHours = [
      day('12:00', '22:00'),
      ...Array(6).fill(null)
    ]
    expect(openingStatus(soDomingo, brt('2026-10-26T10:00:00'))).toMatchObject({
      open: false,
      opens: { day: 'dom', time: '12:00' },
      today: 'seg fechado'
    })
  })
  test('sem horário, nada', () => {
    expect(openingStatus(null, new Date())).toBeNull()
  })
})
