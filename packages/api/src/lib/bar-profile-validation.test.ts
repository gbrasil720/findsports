import { expect, test } from 'bun:test'

import {
  mensagemEnderecoNaoEncontrado,
  motivoTelefoneInvalido,
  UFS
} from './bar-profile-validation'

test('aceita celular, fixo, formato legado e vazio', () => {
  expect(motivoTelefoneInvalido('+5511988446094')).toBeNull()
  expect(motivoTelefoneInvalido('+551132104567')).toBeNull()
  expect(motivoTelefoneInvalido('11988446094')).toBeNull()
  expect(motivoTelefoneInvalido('(21) 3210-4567')).toBeNull()
  expect(motivoTelefoneInvalido('')).toBeNull()
  expect(motivoTelefoneInvalido('  ')).toBeNull()
  expect(motivoTelefoneInvalido(undefined)).toBeNull()
})

test('o telefone que o bar já tem passa sem conferência', () => {
  expect(motivoTelefoneInvalido('+5555512345678', '+5555512345678')).toBeNull()
  expect(motivoTelefoneInvalido('+5555512345678', '+5511988446094')).toContain(
    'Celular'
  )
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

test('as UFs são as do arquivo de municípios do IBGE, sem faltar nem sobrar', async () => {
  const { default: centros } = await import('../data/municipios-centros.json')
  const doIbge = [...new Set((centros as [string, string][]).map((m) => m[1]))]
  expect(Object.keys(UFS).sort()).toEqual(doIbge.sort())
})

test('a recusa de endereço cita a UF quando o bar tem uma', () => {
  expect(mensagemEnderecoNaoEncontrado(' Bonito ', 'MS')).toBe(
    'Não encontramos esse endereço em Bonito, MS. Confira a rua, o número, a cidade e o estado.'
  )
  expect(mensagemEnderecoNaoEncontrado('Bonito', null)).toBe(
    'Não encontramos esse endereço em Bonito. Confira a rua, o número e a cidade.'
  )
})
