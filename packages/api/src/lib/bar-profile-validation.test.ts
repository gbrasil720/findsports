import { expect, test } from 'bun:test'

import { motivoTelefoneInvalido } from './bar-profile-validation'

test('aceita celular, fixo, formato legado e vazio', () => {
  expect(motivoTelefoneInvalido('+5511988446094')).toBeNull()
  expect(motivoTelefoneInvalido('+551132104567')).toBeNull()
  expect(motivoTelefoneInvalido('11988446094')).toBeNull()
  expect(motivoTelefoneInvalido('(21) 3210-4567')).toBeNull()
  expect(motivoTelefoneInvalido('')).toBeNull()
  expect(motivoTelefoneInvalido('  ')).toBeNull()
})

test('recusa o telefone do cadastro incoerente de produção', () => {
  // "55" digitado de novo depois do +55: DDD 55 existe, mas o número começa
  // com 5 e tem 9 dígitos — não é celular.
  expect(motivoTelefoneInvalido('+5555512345678')).toBe(
    'Celular deve começar com 9 depois do DDD. Confira o telefone.'
  )
})

test('diz o que está errado', () => {
  expect(motivoTelefoneInvalido('+351912345678')).toBe(
    'Informe um telefone do Brasil (+55).'
  )
  expect(motivoTelefoneInvalido('+55119884460')).toContain('incompleto')
  expect(motivoTelefoneInvalido('+55119884460941')).toContain('incompleto')
  expect(motivoTelefoneInvalido('+552098844609')).toBe(
    'DDD 20 não existe. Confira o telefone.'
  )
  expect(motivoTelefoneInvalido('+5501988446094')).toContain('DDD 01')
  expect(motivoTelefoneInvalido('+551188446094')).toContain('fixo')
})
