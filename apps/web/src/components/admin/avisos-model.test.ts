import { describe, expect, test } from 'bun:test'
import type { EventCreationPolicy } from './admin-model'
import {
  avisoDaTela,
  avisoDoMomento,
  cardDoPlano,
  type Situacao
} from './avisos-model'

const NOW = new Date('2026-10-12T15:00:00Z')

type Assinatura = NonNullable<Situacao['assinatura']>
const assinatura = (over: Partial<Assinatura>): Assinatura =>
  ({
    id: 's',
    barId: 'b',
    plan: 'elite',
    status: 'active',
    provider: 'stripe',
    externalSubscriptionId: 'sub_1',
    monthlyDiscountReais: null,
    currentPeriodEnd: '2026-11-12T15:00:00Z',
    cancelAt: null,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    currentPlan: 'elite',
    standing: 'current',
    ...over
  }) as Assinatura

const limitada = (
  used: number,
  over: Partial<Extract<EventCreationPolicy, { status: 'limited' }>> = {}
): EventCreationPolicy => ({
  status: 'limited',
  plan: 'starter',
  limit: 5,
  used,
  remaining: 5 - used,
  canCreate: used < 5,
  periodStart: '2026-10-12T15:00:00.000Z',
  periodEnd: '2026-11-12T15:00:00.000Z',
  ...over
})

const ilimitada: EventCreationPolicy = {
  status: 'unlimited',
  canCreate: true,
  plan: 'elite'
}

const teste = assinatura({
  status: 'trialing',
  provider: null,
  externalSubscriptionId: null,
  currentPeriodEnd: '2027-02-09T15:00:00Z'
})
const starter = (used: number): Situacao => ({
  ativo: true,
  assinatura: assinatura({ plan: 'starter', currentPlan: 'starter' }),
  politica: limitada(used)
})
const pendente: Situacao = {
  ativo: true,
  assinatura: assinatura({
    status: 'past_due',
    standing: 'past_due',
    currentPlan: null
  }),
  politica: limitada(4)
}

describe('avisoDoMomento', () => {
  test('carregando: nada', () => {
    expect(
      avisoDoMomento({
        ativo: undefined,
        assinatura: teste,
        politica: ilimitada
      })
    ).toBeNull()
    expect(
      avisoDoMomento({
        ativo: true,
        assinatura: undefined,
        politica: undefined
      })
    ).toBeNull()
  })

  test('fora do ar ganha de todos, com o texto de antes', () => {
    const aviso = avisoDoMomento({ ...pendente, ativo: false })
    expect(aviso).toMatchObject({
      tipo: 'fora',
      tom: 'perigo',
      titulo: 'Seu bar não está visível na plataforma',
      acao: { rotulo: 'Ver planos', para: '/plan' }
    })
  })

  test('teste do cadastro: plano e data por extenso', () => {
    expect(
      avisoDoMomento({ ativo: true, assinatura: teste, politica: ilimitada })
    ).toMatchObject({
      tipo: 'trial',
      titulo: 'Trial gratuito do Elite até 9 de fevereiro',
      acao: { rotulo: 'Garantir o Elite', variante: 'acid' },
      plano: 'elite'
    })
  })

  test('quem contratou durante o teste não vê o aviso do teste', () => {
    const contratado = assinatura({ status: 'trialing' })
    expect(
      avisoDoMomento({
        ativo: true,
        assinatura: contratado,
        politica: ilimitada
      })
    ).toBeNull()
  })

  test('Starter: dentro do limite, último jogo e limite atingido', () => {
    expect(avisoDoMomento(starter(2))).toMatchObject({
      tipo: 'starter',
      tom: 'info',
      titulo: 'Plano Starter — 3 de 5 jogos restantes',
      texto: 'Você usou 2 jogos neste período de cobrança.',
      acao: null
    })
    expect(avisoDoMomento(starter(4))).toMatchObject({
      tipo: 'ultimo',
      titulo: 'Último jogo disponível no plano Starter',
      acao: { rotulo: 'Fazer upgrade', para: '/plan' }
    })
    expect(avisoDoMomento(starter(5))).toMatchObject({
      tipo: 'limite',
      tom: 'perigo',
      titulo: 'Limite de jogos atingido até 12 de novembro',
      texto: 'Faça upgrade para o plano Pro e cadastre jogos ilimitados.'
    })
  })

  test('Pro ou Elite parado: regularizar, mesmo no limite (WEB-331)', () => {
    expect(avisoDoMomento(pendente)).toMatchObject({
      tipo: 'pendente',
      titulo: 'Pagamento pendente — 1 de 5 jogos restantes',
      texto:
        'O último pagamento não foi confirmado. Os jogos ilimitados voltam assim que a assinatura for regularizada.',
      acao: { rotulo: 'Regularizar assinatura', para: '/admin/billing' }
    })
    expect(
      avisoDoMomento({ ...pendente, politica: limitada(5) })
    ).toMatchObject({ tipo: 'pendente' })
  })

  test('teste encerrado sem pagamento leva aos planos', () => {
    expect(
      avisoDoMomento({
        ativo: true,
        assinatura: assinatura({
          status: 'trialing',
          standing: 'trial_ended',
          currentPlan: null
        }),
        politica: limitada(3)
      })
    ).toMatchObject({
      tipo: 'encerrado',
      titulo: 'Trial encerrado — 2 de 5 jogos restantes',
      acao: { rotulo: 'Continuar no Elite', para: '/plan', variante: 'acid' }
    })
  })

  test('sem assinatura não há aviso do Starter', () => {
    expect(
      avisoDoMomento({ ativo: true, assinatura: null, politica: limitada(2) })
    ).toBeNull()
  })
})

describe('avisoDaTela', () => {
  test('o teste só aparece em Hoje; o Starter dentro do limite, só em Jogos', () => {
    const comTeste = { ativo: true, assinatura: teste, politica: ilimitada }
    expect(avisoDaTela(comTeste, 'hoje')?.tipo).toBe('trial')
    expect(avisoDaTela(comTeste, 'jogos')).toBeNull()
    expect(avisoDaTela(starter(2), 'hoje')).toBeNull()
    expect(avisoDaTela(starter(2), 'jogos')?.tipo).toBe('starter')
  })

  test('limite, pendente e fora do ar aparecem nas duas', () => {
    for (const s of [starter(5), pendente, { ...pendente, ativo: false }]) {
      expect(avisoDaTela(s, 'hoje')).not.toBeNull()
      expect(avisoDaTela(s, 'jogos')).not.toBeNull()
    }
  })
})

describe('cardDoPlano', () => {
  test('teste: dias usados de 120 e o botão de garantir', () => {
    const card = cardDoPlano(
      { ativo: true, assinatura: teste, politica: ilimitada },
      269,
      // Faltam 108 dias: 12 usados.
      new Date(Date.parse('2027-02-09T15:00:00Z') - 108 * 86_400_000)
    )
    expect(card).toMatchObject({
      estado: 'trial',
      nome: 'Elite',
      selo: { texto: 'Trial gratuito', tipo: 'ink' },
      linha: 'Grátis até 9 fev · sem cartão',
      uso: { tipo: 'dias', usados: 12, total: 120 },
      acao: { rotulo: 'Garantir o Elite · R$ 0 hoje' },
      kind: 'hero'
    })
  })

  test('em dia: preço e próxima cobrança, sem botão', () => {
    expect(
      cardDoPlano(
        { ativo: true, assinatura: assinatura({}), politica: ilimitada },
        269,
        NOW
      )
    ).toMatchObject({
      estado: 'ativo',
      selo: { texto: 'Ativo' },
      linha: 'R$ 269/mês · próxima cobrança 12 nov',
      acao: null
    })
  })

  test('Starter dentro e no limite', () => {
    expect(cardDoPlano(starter(2), 69, NOW)).toMatchObject({
      estado: 'starter',
      linha: 'R$ 69/mês · renova 12 nov',
      uso: { usados: 2, total: 5, rotulo: '2 de 5 jogos usados neste ciclo' },
      acao: { rotulo: 'Fazer upgrade', variante: 'ink' }
    })
    expect(cardDoPlano(starter(5), 69, NOW)).toMatchObject({
      estado: 'limite',
      selo: { texto: 'Limite atingido', tipo: 'live' },
      linha: 'R$ 69/mês · o limite volta em 12 nov',
      uso: { rotulo: '5 de 5 jogos usados', cheio: true },
      acao: { rotulo: 'Fazer upgrade para o Pro', variante: 'acid' }
    })
  })

  test('pagamento pendente: jogos do Starter e regularizar', () => {
    expect(cardDoPlano(pendente, 269, NOW)).toMatchObject({
      estado: 'pendente',
      nome: 'Elite',
      selo: { texto: 'Pagamento pendente', tipo: 'live' },
      uso: { rotulo: '4 de 5 jogos do Starter usados' },
      acao: { rotulo: 'Regularizar assinatura', para: '/admin/billing' }
    })
  })

  test('fora do ar ou sem assinatura: sem plano', () => {
    expect(cardDoPlano({ ...pendente, ativo: false }, null, NOW)).toMatchObject(
      {
        estado: 'sem',
        plano: null,
        linha: 'O bar está fora das buscas e do mapa.',
        acao: { rotulo: 'Ver planos' }
      }
    )
    expect(
      cardDoPlano({ ativo: true, assinatura: null, politica: undefined }, null)
    ).toMatchObject({ estado: 'sem', linha: null })
  })
})
