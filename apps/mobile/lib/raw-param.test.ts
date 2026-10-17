/// <reference types="bun-types" />
import { expect, test } from 'bun:test'
import { rawParam } from './raw-param'

test('mantém o + que vem codificado e troca o + cru por espaço', () => {
  // O que o servidor manda: `URLSearchParams` codifica `+` como `%2B` e
  // espaço como `+`.
  const sent = new URLSearchParams({ cookie: 'a=b+c/d==; Path=/' }).toString()
  expect(rawParam(`onside://verified?${sent}`, 'cookie')).toBe(
    'a=b+c/d==; Path=/'
  )
})

test('acha o parâmetro entre outros e ignora o fragmento', () => {
  const url = 'exp://127.0.0.1:8082/--/verified?x=1&cookie=v%3D1#fim'
  expect(rawParam(url, 'cookie')).toBe('v=1')
  expect(rawParam(url, 'nada')).toBeUndefined()
  expect(rawParam('onside://verified', 'cookie')).toBeUndefined()
})
