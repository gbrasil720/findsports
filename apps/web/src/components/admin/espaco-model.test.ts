import { describe, expect, test } from 'bun:test'
import type { AdminBar } from './admin-model'
import {
  abertoAte,
  alteracoes,
  checklistDoPerfil,
  diaDoJogo,
  iniciaisDoApp,
  quandoNaGota,
  rascunhoDoBar,
  recursoPago,
  SEMANA_PADRAO,
  siglaDoTime,
  temAlteracao
} from './espaco-model'

const bar = {
  name: 'Bar da Vila',
  photoUrl: 'https://example.com/bar.jpg',
  description: null,
  address: 'Rua das Flores, 123',
  neighborhood: 'Centro',
  city: 'São Paulo',
  uf: null,
  phone: '+5511999999999',
  phoneAcceptsWhatsapp: true,
  amenities: [1, 2, 8],
  screenCount: null,
  menuUrl: null,
  averageSpendCents: 4550,
  houseOffer: null,
  openingHours: null
} as unknown as AdminBar

const ambos = { podeCardapio: true, podeOferta: true }

describe('alteracoes', () => {
  test('rascunho igual ao gravado não tem o que salvar', () => {
    const a = alteracoes(bar, rascunhoDoBar(bar), ambos)
    expect(temAlteracao(a)).toBe(false)
    expect(a.erros).toEqual({})
  })

  test('manda só o que mudou, cada parte na sua mutation', () => {
    const r = {
      ...rascunhoDoBar(bar),
      description: 'Telão e chope',
      amenities: [8, 2, 1],
      menuUrl: 'cardapio.example.com',
      houseOffer: '  Chope   em dobro ',
      hours: SEMANA_PADRAO
    }
    const a = alteracoes(bar, r, ambos)
    // Mesma lista em outra ordem não é mudança.
    expect(a.perfil).toEqual({ description: 'Telão e chope' })
    expect(a.cardapio).toEqual({ menuUrl: 'https://cardapio.example.com/' })
    expect(a.oferta).toBe('Chope em dobro')
    expect(a.horario?.[0]).toEqual({ opens: '17:00', closes: '00:00' })
  })

  test('sem o plano, cardápio e oferta ficam de fora', () => {
    const r = { ...rascunhoDoBar(bar), menuUrl: 'x.com', houseOffer: 'Oi' }
    const a = alteracoes(bar, r, { podeCardapio: false, podeOferta: false })
    expect(temAlteracao(a)).toBe(false)
  })

  test('erros de cada campo, sem mandar o que está errado', () => {
    const r = {
      ...rascunhoDoBar(bar),
      name: ' ',
      phone: '+5511887654321',
      screenCount: 100,
      averageSpend: '1500',
      houseOffer: 'a'.repeat(141),
      hours: SEMANA_PADRAO.map((d, i) =>
        i === 1 ? { ...d, closes: d.opens } : d
      )
    }
    const a = alteracoes(bar, r, ambos)
    expect(Object.keys(a.erros).sort()).toEqual([
      'averageSpend',
      'hours',
      'houseOffer',
      'name',
      'phone',
      'screenCount'
    ])
    expect(a.perfil).toBeNull()
    expect(a.oferta).toBeUndefined()
  })

  test('rua e número abrem separados e vão juntos em `address`', () => {
    const base = rascunhoDoBar(bar)
    expect([base.rua, base.numero]).toEqual(['Rua das Flores', '123'])
    const a = alteracoes(bar, { ...base, numero: '125' }, ambos)
    expect(a.perfil).toEqual({ address: 'Rua das Flores, 125' })
  })

  test('endereço sem vírgula fica todo na rua e não muda ao salvar outra coisa', () => {
    const semVirgula = { ...bar, address: 'Rua das Flores 123' } as AdminBar
    const base = rascunhoDoBar(semVirgula)
    expect([base.rua, base.numero]).toEqual(['Rua das Flores 123', ''])
    const a = alteracoes(semVirgula, { ...base, name: 'Outro bar' }, ambos)
    expect(a.perfil).toEqual({ name: 'Outro bar' })
    // Mexer na rua pede o número, como no cadastro.
    const b = alteracoes(semVirgula, { ...base, rua: 'Rua das Flores' }, ambos)
    expect(b.erros).toEqual({ numero: 'Informe o número.' })
    expect(b.perfil).toBeNull()
  })

  test('limpar o telefone e tirar o horário também são mudança', () => {
    const comHorario = {
      ...bar,
      openingHours: Array(7).fill({ opens: '18:00', closes: '23:00' })
    } as AdminBar
    const r = { ...rascunhoDoBar(comHorario), phone: '', hours: null }
    const a = alteracoes(comHorario, r, ambos)
    expect(a.perfil).toEqual({ phone: '' })
    expect(a.horario).toBeNull()
  })
})

describe('checklistDoPerfil', () => {
  test('seis itens, do gravado', () => {
    const itens = checklistDoPerfil(bar, true)
    expect(itens).toHaveLength(6)
    expect(itens.every((i) => i.done)).toBe(true)
  })

  test('WhatsApp só conta com telefone; características a partir de três', () => {
    const itens = checklistDoPerfil(
      { ...bar, phone: null, amenities: [1, 2] } as AdminBar,
      false
    )
    const feito = Object.fromEntries(itens.map((i) => [i.key, i.done]))
    expect(feito).toMatchObject({
      telefone: false,
      whatsapp: false,
      caracteristicas: false,
      jogo: false,
      foto: true
    })
  })
})

describe('recursoPago', () => {
  test('Pro libera cardápio, não oferta', () => {
    const pro = { status: 'ready', plan: 'pro', standing: 'current' } as const
    expect(recursoPago(pro, 'pro').status).toBe('liberado')
    expect(recursoPago(pro, 'elite')).toMatchObject({
      titulo: 'Disponível no plano Elite',
      link: { to: '/plan' }
    })
  })

  test('plano parado manda regularizar, não contratar (WEB-141)', () => {
    expect(
      recursoPago({ status: 'ready', plan: 'pro', standing: 'past_due' }, 'pro')
    ).toMatchObject({
      titulo: 'Plano Pro com pagamento pendente',
      link: { to: '/admin/billing' }
    })
  })
})

describe('abertoAte', () => {
  const sexta = [
    null,
    null,
    null,
    null,
    null,
    { opens: '17:00', closes: '02:00' },
    null
  ]
  test('aberto pela faixa de hoje e, depois da meia-noite, pela de ontem', () => {
    // Sexta, 20:00 e sábado, 01:00 em Brasília (UTC-3).
    expect(abertoAte(sexta, new Date('2026-10-23T23:00:00Z'))).toBe(
      'aberto até 02h'
    )
    expect(abertoAte(sexta, new Date('2026-10-24T04:00:00Z'))).toBe(
      'aberto até 02h'
    )
    expect(abertoAte(sexta, new Date('2026-10-24T12:00:00Z'))).toBe(
      'fechado agora'
    )
    expect(abertoAte(null, new Date())).toBeNull()
  })
})

describe('Card e Mapa da prévia', () => {
  // Sexta, 24/10/2026, 15:00 em Brasília.
  const agora = new Date('2026-10-24T18:00:00Z')
  test('o dia do jogo é o do app, no relógio de Brasília', () => {
    expect(diaDoJogo('2026-10-25T00:30:00Z', agora)).toBe('Hoje')
    expect(diaDoJogo('2026-10-25T18:00:00Z', agora)).toBe('Amanhã')
    expect(diaDoJogo('2026-10-23T18:00:00Z', agora)).toBe('Ontem')
    expect(diaDoJogo('2026-10-28T18:00:00Z', agora)).toBe('qua., 28/10')
  })
  test('o balão da gota diz quando, ou ao vivo, ou nada sem jogo', () => {
    expect(
      quandoNaGota({ startsAt: '2026-10-25T00:30:00Z' }, false, agora)
    ).toBe('HOJE 21:30')
    expect(
      quandoNaGota({ startsAt: '2026-10-28T18:00:00Z' }, false, agora)
    ).toBe('QUA 15:00')
    expect(
      quandoNaGota({ startsAt: '2026-10-24T17:00:00Z' }, true, agora)
    ).toBe('AO VIVO')
    expect(quandoNaGota(null, false, agora)).toBeNull()
  })
  test('siglas e iniciais como o app desenha', () => {
    expect(siglaDoTime('São Paulo')).toBe('SÃO')
    expect(siglaDoTime('Red Bull Racing')).toBe('RED')
    expect(iniciaisDoApp('Bar do Zé')).toBe('BD')
    expect(iniciaisDoApp('7 Mares Bar')).toBe('MB')
  })
})
