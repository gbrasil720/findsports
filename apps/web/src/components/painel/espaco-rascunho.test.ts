import { describe, expect, test } from 'bun:test'
import {
  cardapio,
  doBar,
  entradaDoPerfil,
  horario,
  oferta,
  perfilMudou
} from './espaco-rascunho'

const bar = {
  name: 'Bar do Zé',
  address: 'Rua Aspicuelta, 214',
  neighborhood: 'Vila Madalena',
  city: 'São Paulo',
  uf: null,
  phone: null,
  description: null,
  amenities: [1, 4],
  screenCount: 3,
  houseOffer: null,
  menuUrl: null,
  averageSpendCents: 8000
}

describe('rascunho de Meu espaço', () => {
  test('nada mexido não manda nada', () => {
    const r = doBar(bar)
    expect(r.perfil.rua).toBe('Rua Aspicuelta')
    expect(r.perfil.numero).toBe('214')
    expect(entradaDoPerfil(r.perfil, r.perfil, '')).toEqual({})
    expect(perfilMudou(r.perfil, r.perfil, '')).toBe(false)
    // Mesma lista em outra ordem não é mudança.
    expect(perfilMudou({ ...r.perfil, amenities: [4, 1] }, r.perfil, '')).toBe(
      false
    )
  })

  test('só o que mudou vai, com rua e número juntos', () => {
    const base = doBar(bar).perfil
    expect(
      entradaDoPerfil(
        { ...base, numero: '300', description: 'Telão', name: '  ' },
        base,
        ''
      )
    ).toEqual({ address: 'Rua Aspicuelta, 300', description: 'Telão' })
  })

  test('CEP inteiro vai sozinho; UF vazia não vai', () => {
    const base = doBar(bar).perfil
    expect(entradaDoPerfil(base, base, '05433-000')).toEqual({
      cep: '05433-000'
    })
    expect(entradaDoPerfil(base, base, '05433')).toEqual({})
    expect(entradaDoPerfil({ ...base, uf: 'SP' }, base, '')).toEqual({
      uf: 'SP'
    })
  })

  test('oferta e cardápio dizem o que mudou e o que está errado', () => {
    expect(oferta('  Chopp em dobro  ', null).mudou).toBe(true)
    expect(oferta('', null).mudou).toBe(false)
    expect(oferta('x'.repeat(141), null).erro).toContain('Tire 1')

    const gravado = { menuUrl: null, averageSpendCents: 8000 }
    expect(cardapio({ url: '', gasto: '80,00' }, gravado).mudou).toBe(false)
    const ruim = cardapio({ url: '@bar', gasto: '80,00' }, gravado)
    expect(ruim.mudou).toBe(true)
    expect(ruim.erroUrl).toContain('instagram.com')
    expect(
      cardapio({ url: 'cardapio.bar', gasto: '' }, gravado).mudancas
    ).toEqual({ menuUrl: 'https://cardapio.bar/', averageSpendCents: null })
  })
})

describe('horário de Meu espaço (WEB-397)', () => {
  const sexta = { opens: '17:00', closes: '02:00' }

  test('sem horário gravado, a semana nasce fechada e não muda nada', () => {
    const r = doBar(bar)
    expect(r.horario).toEqual([null, null, null, null, null, null, null])
    expect(horario(r.horario, null)).toEqual({
      valor: null,
      erro: null,
      mudou: false
    })
  })

  test('ligar um dia muda; desligar tudo volta a "não informado"', () => {
    const semana = [null, null, null, null, null, sexta, null]
    expect(horario(semana, null)).toMatchObject({ valor: semana, mudou: true })
    expect(horario([null, null, null, null, null, null, null], semana)).toEqual(
      { valor: null, erro: null, mudou: true }
    )
  })

  test('abre e fecha na mesma hora é erro', () => {
    const semana = [null, null, null, null, null, sexta, null]
    semana[6] = { opens: '18:00', closes: '18:00' }
    expect(horario(semana, null).erro).not.toBeNull()
  })
})
