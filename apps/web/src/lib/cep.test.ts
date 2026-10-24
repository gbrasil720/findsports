import { describe, expect, test } from 'bun:test'
import { formatarCep, lerViaCep } from './cep'

describe('CEP do cadastro do bar', () => {
  test('formata enquanto digita e corta no oitavo dígito', () => {
    expect(formatarCep('054')).toBe('054')
    expect(formatarCep('05433000')).toBe('05433-000')
    expect(formatarCep('05433-0009')).toBe('05433-000')
  })

  test('lê o endereço do ViaCEP e recusa o CEP inexistente', () => {
    expect(
      lerViaCep({
        logradouro: 'Rua Aspicuelta',
        bairro: 'Vila Madalena',
        localidade: 'São Paulo',
        uf: 'SP'
      })
    ).toEqual({
      rua: 'Rua Aspicuelta',
      bairro: 'Vila Madalena',
      cidade: 'São Paulo',
      uf: 'SP'
    })
    expect(lerViaCep({ erro: 'true' })).toBeNull()
    expect(lerViaCep(null)).toBeNull()
    expect(lerViaCep({ localidade: 'Cidade', uf: 'XX' })?.uf).toBe('')
  })
})
