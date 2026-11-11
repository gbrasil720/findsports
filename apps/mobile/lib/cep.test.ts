import { describe, expect, it } from 'bun:test'
import { formatCep, readViaCep } from './cep'

describe('CEP', () => {
  it('formata enquanto digita', () => {
    expect(formatCep('05433')).toBe('05433')
    expect(formatCep('05433000')).toBe('05433-000')
    expect(formatCep('05433-0001')).toBe('05433-000')
  })
  it('lê o ViaCEP e recusa o inexistente', () => {
    expect(
      readViaCep({
        logradouro: 'Rua Aspicuelta',
        bairro: 'Vila Madalena',
        localidade: 'São Paulo',
        uf: 'SP'
      })
    ).toEqual({
      street: 'Rua Aspicuelta',
      neighborhood: 'Vila Madalena',
      city: 'São Paulo',
      uf: 'SP'
    })
    expect(readViaCep({ erro: true })).toBeNull()
  })
})
