import { describe, expect, test } from 'bun:test'
import { formatCnpj, isValidCnpj, normalizeCnpj } from './cnpj'

describe('isValidCnpj', () => {
  test('aceita CNPJ de números com e sem pontuação', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    expect(isValidCnpj('11222333000181')).toBe(true)
    expect(isValidCnpj(' 11 222 333 0001 81 ')).toBe(true)
  })

  test('aceita o CNPJ com letras (o exemplo da Receita)', () => {
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true)
    expect(isValidCnpj('12abc34501de35')).toBe(true)
  })

  test('recusa dígito verificador errado', () => {
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false)
    expect(isValidCnpj('11.222.333/0001-91')).toBe(false)
    expect(isValidCnpj('12.ABC.345/01DE-36')).toBe(false)
  })

  test('recusa tamanho errado, letra no dígito e repetição', () => {
    expect(isValidCnpj('')).toBe(false)
    expect(isValidCnpj('1122233300018')).toBe(false)
    expect(isValidCnpj('112223330001811')).toBe(false)
    expect(isValidCnpj('12ABC34501DE3A')).toBe(false)
    expect(isValidCnpj('00.000.000/0000-00')).toBe(false)
    expect(isValidCnpj('11111111111111')).toBe(false)
  })
})

test('normalizeCnpj tira a pontuação e põe em maiúsculas', () => {
  expect(normalizeCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35')
})

test('formatCnpj põe a pontuação; o que não tem 14 caracteres volta igual', () => {
  expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81')
  expect(formatCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35')
  expect(formatCnpj('123')).toBe('123')
})
