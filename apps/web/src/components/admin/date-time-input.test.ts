import { expect, test } from 'bun:test'

import { formatDateTime, maskDateTime, parseDateTime } from './date-time-input'

test('digitar só números põe as barras, o espaço e os dois-pontos', () => {
  const typed = [...'081020262130'].reduce<string[]>((steps, digit) => {
    steps.push(maskDateTime(`${steps.at(-1) ?? ''}${digit}`))
    return steps
  }, [])
  expect(typed).toEqual([
    '0',
    '08',
    '08/1',
    '08/10',
    '08/10/2',
    '08/10/20',
    '08/10/202',
    '08/10/2026',
    '08/10/2026 2',
    '08/10/2026 21',
    '08/10/2026 21:3',
    '08/10/2026 21:30'
  ])
  // Passou de doze dígitos, o resto é ignorado; letra não entra.
  expect(maskDateTime('08/10/2026 21:309')).toBe('08/10/2026 21:30')
  expect(maskDateTime('ab')).toBe('')
})

test('apagar tira um dígito por vez e nunca trava num separador', () => {
  let text = '08/10/2026 21:30'
  const steps: string[] = []
  while (text) {
    text = maskDateTime(text.slice(0, -1))
    steps.push(text)
  }
  expect(steps).toEqual([
    '08/10/2026 21:3',
    '08/10/2026 21',
    '08/10/2026 2',
    '08/10/2026',
    '08/10/202',
    '08/10/20',
    '08/10/2',
    '08/10',
    '08/1',
    '08',
    '0',
    ''
  ])
})

test('colar aceita data com ou sem zero à esquerda, com ou sem hora', () => {
  expect(maskDateTime('08/10/2026')).toBe('08/10/2026')
  expect(maskDateTime('8/10/2026')).toBe('08/10/2026')
  expect(maskDateTime('8/1/2026 9:05')).toBe('08/01/2026 09:05')
  expect(maskDateTime(' 08/10/2026 21:30 ')).toBe('08/10/2026 21:30')
  expect(maskDateTime('08-10-2026 21h30')).toBe('08/10/2026 21:30')
  // Digitando a barra à mão depois de um dígito só.
  expect(maskDateTime('8/')).toBe('08')
})

test('no meio do texto, um dígito sozinho não é completado com zero', () => {
  // Apagou o "8" de "08/10/2026 21:30": o dia não pode virar "00"; os dígitos
  // se reencaixam e o próximo que for digitado devolve o formato.
  expect(maskDateTime('0/10/2026 21:30', false)).toBe('01/02/0262 13:0')
  expect(maskDateTime('07/10/2026 21:30', false)).toBe('07/10/2026 21:30')
  expect(maskDateTime('0/10/2026 21:30', true)).toBe('00/10/2026 21:30')
})

test('ida e volta com o valor do datetime-local', () => {
  for (const value of [
    '2026-10-08T21:30',
    '2026-01-01T00:00',
    '2026-12-31T23:59',
    '2028-02-29T09:05'
  ]) {
    expect(parseDateTime(formatDateTime(value))).toEqual({ value })
  }
  expect(formatDateTime('2026-10-08T21:30')).toBe('08/10/2026 21:30')
  expect(formatDateTime('')).toBe('')
  expect(parseDateTime('')).toEqual({ value: '' })
  // O valor compõe com `new Date(...)` na hora local, como o do campo nativo.
  const date = new Date(parseDateTime('31/12/2026 23:59').value ?? '')
  expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
    2026, 11, 31
  ])
  expect([date.getHours(), date.getMinutes()]).toEqual([23, 59])
})

test('data que não existe', () => {
  expect(parseDateTime('31/02/2026 21:00')).toEqual({ problem: 'date' })
  expect(parseDateTime('31/04/2026 21:00')).toEqual({ problem: 'date' })
  expect(parseDateTime('00/10/2026 21:00')).toEqual({ problem: 'date' })
  expect(parseDateTime('08/13/2026 21:00')).toEqual({ problem: 'date' })
  // Já dá para saber antes da hora.
  expect(parseDateTime('31/02/2026')).toEqual({ problem: 'date' })
})

test('29/02 só existe em ano bissexto', () => {
  expect(parseDateTime('29/02/2028 21:00')).toEqual({
    value: '2028-02-29T21:00'
  })
  expect(parseDateTime('29/02/2026 21:00')).toEqual({ problem: 'date' })
  expect(parseDateTime('29/02/2100 21:00')).toEqual({ problem: 'date' })
  expect(parseDateTime('29/02/2000 21:00')).toEqual({
    value: '2000-02-29T21:00'
  })
})

test('virada de ano', () => {
  expect(parseDateTime('31/12/2026 23:59')).toEqual({
    value: '2026-12-31T23:59'
  })
  expect(parseDateTime('01/01/2027 00:00')).toEqual({
    value: '2027-01-01T00:00'
  })
  expect(parseDateTime('32/12/2026 00:00')).toEqual({ problem: 'date' })
})

test('hora fora de 00:00–23:59', () => {
  expect(parseDateTime('08/10/2026 24:00')).toEqual({ problem: 'time' })
  expect(parseDateTime('08/10/2026 23:60')).toEqual({ problem: 'time' })
  expect(parseDateTime('08/10/2026 25')).toEqual({ problem: 'time' })
  expect(parseDateTime('08/10/2026 00:00')).toEqual({
    value: '2026-10-08T00:00'
  })
  expect(parseDateTime('08/10/2026 23:59')).toEqual({
    value: '2026-10-08T23:59'
  })
})

test('incompleto', () => {
  for (const text of ['0', '08/10', '08/10/202', '08/10/2026', '08/10/2026 2'])
    expect(parseDateTime(text)).toEqual({ problem: 'incomplete' })
  expect(parseDateTime('08/10/2026 21:3')).toEqual({ problem: 'incomplete' })
})
