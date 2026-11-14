import { describe, expect, test } from 'bun:test'

import { TERMOS_DE_USO } from '@findsports_oficial/legal/termos-de-uso'
import {
  annualDeal,
  billedPlan,
  earnsDowngradeCredit,
  FOUNDER_DISCOUNT,
  formatPlanChargeLine,
  formatReais,
  founderCouponFromQuery,
  getCommonPlanItems,
  getDefaultPlanSelection,
  getPlan,
  getPlanCardLists,
  getPlanExitLink,
  getPlanHeader,
  getPlanLosses,
  getPlanLossNote,
  getPlanPageMode,
  getTrialNotice,
  getTrialProgress,
  isContractedTrial,
  isDowngrade,
  PLAN_CATALOG,
  PLAN_TIER_ORDER,
  parsePlanChange,
  parsePlanOrigin,
  planChangeReturnUrl,
  planChargeForAnnual,
  planChargeForCurrentPlan,
  planChargeForShowcase,
  planChargeFromSubscription
} from '@/lib/plan-catalog'

describe('PLAN_CATALOG structure', () => {
  test('contains exactly three plans', () => {
    expect(PLAN_CATALOG.length).toBe(3)
  })

  test('plan IDs are starter, pro, elite', () => {
    const ids = PLAN_CATALOG.map((p) => p.id)
    expect(ids).toEqual(['starter', 'pro', 'elite'])
  })

  test('no duplicate IDs', () => {
    const ids = PLAN_CATALOG.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('each plan has required fields', () => {
    for (const plan of PLAN_CATALOG) {
      expect(plan.id).toBeDefined()
      expect(plan.name).toBeTruthy()
      expect(plan.tablePrice).toBeGreaterThan(0)
      expect(plan.period).toBeTruthy()
      expect(plan.features).toBeInstanceOf(Array)
      expect(plan.features.length).toBeGreaterThan(0)
    }
  })
})

describe('preços (WEB-112)', () => {
  test('tabela cheia e preço de fundador de cada plano', () => {
    expect(
      PLAN_CATALOG.map((p) => [p.id, p.tablePrice, p.founderPrice])
    ).toEqual([
      ['starter', 97, 69],
      ['pro', 147, 119],
      ['elite', 297, 269]
    ])
  })

  test('os Termos de Uso publicam os mesmos números', () => {
    const tabela = TERMOS_DE_USO.sections
      .flatMap((section) => section.blocks)
      .find(
        (block) => block.type === 'table' && block.head.includes('Tabela cheia')
      )
    const reais = (valor: number) => `R$ ${valor},00/mês`

    expect(tabela).toMatchObject({
      head: ['Plano', 'Desconto de fundador', 'Lançamento', 'Tabela cheia'],
      rows: PLAN_CATALOG.map((p) => [
        p.name,
        reais(FOUNDER_DISCOUNT),
        reais(p.founderPrice),
        reais(p.tablePrice)
      ])
    })
  })

  test('vitrine só promete desconto com cupom disponível', () => {
    const elite = getPlan('elite')
    expect(
      formatPlanChargeLine(planChargeForShowcase(elite, true), elite.period)
    ).toBe('R$ 269/mês (tabela cheia R$ 297/mês)')
    expect(
      formatPlanChargeLine(planChargeForShowcase(elite, false), elite.period)
    ).toBe('R$ 297/mês')
  })

  // Enquanto o cupom carrega não há preço: a tabela cheia trocaria para o de
  // fundador na frente do dono.
  test('cupom pendente não vira preço, nem na vitrine nem no plano atual', () => {
    const pro = getPlan('pro')
    const pending = founderCouponFromQuery({ isPending: true })
    expect(pending).toBeNull()
    expect(planChargeForShowcase(pro, pending)).toBeNull()
    expect(
      planChargeForCurrentPlan(
        pro,
        { externalSubscriptionId: null, monthlyDiscountReais: null },
        pending
      )
    ).toBeNull()
    // Com assinatura no Stripe o valor é o gravado, e não espera o cupom.
    expect(
      planChargeForCurrentPlan(
        pro,
        { externalSubscriptionId: 'sub_1', monthlyDiscountReais: 28 },
        pending
      )?.chargeReais
    ).toBe(119)
  })

  test('cupom respondido vale a resposta, e consulta que falhou vale tabela cheia', () => {
    expect(
      founderCouponFromQuery({ isPending: false, data: { available: true } })
    ).toBe(true)
    expect(
      founderCouponFromQuery({ isPending: false, data: { available: false } })
    ).toBe(false)
    expect(founderCouponFromQuery({ isPending: false })).toBe(false)
  })

  // WEB-534: consulta parada não deixa o card em "Carregando preço…".
  test('passado o teto, cupom ainda pendente vale tabela cheia', () => {
    const pro = getPlan('pro')
    const waited = founderCouponFromQuery({ isPending: true }, true)
    expect(waited).toBe(false)
    expect(
      planChargeForCurrentPlan(
        pro,
        { externalSubscriptionId: null, monthlyDiscountReais: null },
        waited
      )
    ).toEqual({ chargeReais: 147, listReais: null, hint: null })
    // A resposta que chega depois do teto ainda vale.
    expect(
      founderCouponFromQuery(
        { isPending: false, data: { available: true } },
        true
      )
    ).toBe(true)
  })

  // WEB-353: quem já assina troca de plano pelo portal, sem checkout.
  test('dica do desconto fala de checkout só para quem ainda não assina', () => {
    const pro = getPlan('pro')
    expect(planChargeForShowcase(pro, true).hint).toBe(
      'Com desconto de fundador no checkout'
    )
    expect(planChargeForShowcase(pro, true, true).hint).toBe(
      'Com desconto de fundador na assinatura'
    )
    expect(planChargeForShowcase(pro, false, true).hint).toBeNull()
  })

  test('Starter anuncia o limite pelo ciclo de cobrança, não por mês', () => {
    expect(getPlan('starter').features).toContain(
      'Até 5 jogos por ciclo de cobrança na agenda'
    )
  })

  test('assinatura gravada reflete desconto do webhook', () => {
    const pro = getPlan('pro')
    expect(
      formatPlanChargeLine(planChargeFromSubscription(pro, 28), pro.period)
    ).toBe('R$ 119/mês (tabela cheia R$ 147/mês)')
    expect(
      formatPlanChargeLine(planChargeFromSubscription(pro, 0), pro.period)
    ).toBe('R$ 147/mês')
    expect(
      formatPlanChargeLine(planChargeFromSubscription(pro, null), pro.period)
    ).toBe('R$ 147/mês')
  })

  test('card Plano atual: sem assinatura no Stripe segue a vitrine, com assinatura segue o desconto gravado (WEB-343)', () => {
    const elite = getPlan('elite')
    const semStripe = {
      externalSubscriptionId: null,
      monthlyDiscountReais: null
    }
    expect(planChargeForCurrentPlan(elite, semStripe, true)).toEqual(
      planChargeForShowcase(elite, true)
    )
    expect(planChargeForCurrentPlan(elite, semStripe, true)).toMatchObject({
      chargeReais: 269,
      listReais: 297,
      hint: 'Com desconto de fundador no checkout'
    })
    expect(planChargeForCurrentPlan(elite, semStripe, false)).toEqual({
      chargeReais: 297,
      listReais: null,
      hint: null
    })

    // Com assinatura, o cupom disponível hoje não diz nada sobre o que ela paga.
    const pro = getPlan('pro')
    const comStripe = (monthlyDiscountReais: number | null) => ({
      externalSubscriptionId: 'sub_123',
      monthlyDiscountReais
    })
    expect(planChargeForCurrentPlan(pro, comStripe(28), false)).toEqual(
      planChargeFromSubscription(pro, 28)
    )
    expect(planChargeForCurrentPlan(pro, comStripe(28), false)).toMatchObject({
      chargeReais: 119,
      listReais: 147
    })
    expect(planChargeForCurrentPlan(pro, comStripe(0), true).chargeReais).toBe(
      147
    )
  })
})

describe('getPlan', () => {
  test('returns correct plan for each ID', () => {
    expect(getPlan('starter').id).toBe('starter')
    expect(getPlan('pro').id).toBe('pro')
    expect(getPlan('elite').id).toBe('elite')
  })

  test('returned plans match catalog entries', () => {
    for (const plan of PLAN_CATALOG) {
      expect(getPlan(plan.id)).toBe(plan)
    }
  })
})

describe('Tier ordering', () => {
  test('tier order is starter < pro < elite', () => {
    expect(PLAN_TIER_ORDER.starter).toBe(0)
    expect(PLAN_TIER_ORDER.pro).toBe(1)
    expect(PLAN_TIER_ORDER.elite).toBe(2)
  })

  test('isDowngrade detects correct direction', () => {
    expect(isDowngrade('pro', 'starter')).toBe(true)
    expect(isDowngrade('elite', 'starter')).toBe(true)
    expect(isDowngrade('elite', 'pro')).toBe(true)
    expect(isDowngrade('starter', 'pro')).toBe(false)
    expect(isDowngrade('starter', 'elite')).toBe(false)
    expect(isDowngrade('pro', 'elite')).toBe(false)
  })

  test('same plan is not a downgrade', () => {
    expect(isDowngrade('starter', 'starter')).toBe(false)
    expect(isDowngrade('pro', 'pro')).toBe(false)
    expect(isDowngrade('elite', 'elite')).toBe(false)
  })
})

describe('Saída da tela de planos', () => {
  test.each([
    ['admin', { label: 'Voltar ao painel', to: '/admin' }],
    ['billing', { label: 'Voltar à assinatura', to: '/admin/billing' }]
  ] as const)('volta para %s quando a origem é conhecida', (origin, link) => {
    expect(getPlanExitLink(origin)).toEqual(link)
  })

  test('volta ao painel sem origem', () => {
    expect(getPlanExitLink(undefined)).toEqual({
      label: 'Voltar ao painel',
      to: '/admin'
    })
  })

  test('trata origem inválida como ausência de origem', () => {
    expect(getPlanExitLink(parsePlanOrigin('https://exemplo.test'))).toEqual({
      label: 'Voltar ao painel',
      to: '/admin'
    })
  })
})

describe('Feature text consistency', () => {
  test('no plan contains "Perfil público do bar"', () => {
    for (const plan of PLAN_CATALOG) {
      const match = plan.features.find((f) =>
        f.includes('Perfil público do bar')
      )
      expect(match).toBeUndefined()
    }
  })

  test('starter includes "Perfil do bar no Onside"', () => {
    const starter = getPlan('starter')
    expect(starter.features).toContain('Perfil do bar no Onside')
  })

  test('no plan promises boost/impulsionamento features', () => {
    for (const plan of PLAN_CATALOG) {
      const match = plan.features.find((f) =>
        /impulsion|boost|orgânico/i.test(f)
      )
      expect(match).toBeUndefined()
    }
  })

  test('suporte é o mesmo e-mail em todo plano, sem prioridade (WEB-107)', () => {
    for (const plan of PLAN_CATALOG) {
      expect(plan.features).toContain('Suporte por e-mail')
      expect(plan.features.find((f) => /priorit/i.test(f))).toBeUndefined()
    }
  })

  test('pro includes analytics features from spec', () => {
    const pro = getPlan('pro')
    expect(pro.features).toContain('12 meses de histórico')
    expect(pro.features).toContain('Comparação entre jogos')
    expect(pro.features).toContain(
      'Funil detalhado de rota, telefone e WhatsApp'
    )
  })

  test('starter includes analytics features from spec', () => {
    const starter = getPlan('starter')
    expect(starter.features).toContain(
      'Analytics essenciais dos últimos 30 dias'
    )
    expect(starter.features).toContain('Desempenho básico por jogo')
  })

  test('elite includes analytics features from spec', () => {
    const elite = getPlan('elite')
    expect(elite.features).toContain(
      'Topo na busca por relevância quando há um clássico'
    )
    expect(elite.features).not.toContain('Topo da lista nos clássicos')
    expect(elite.features).toContain('Histórico completo')
    expect(elite.features).toContain('Inteligência avançada')
  })
})

describe('profilePerks', () => {
  test('todo plano diz o que muda no perfil público', () => {
    for (const plan of PLAN_CATALOG) {
      expect(plan.profilePerks.length).toBeGreaterThan(0)
    }
  })

  test('starter não promete nada que ainda não existe', () => {
    const starter = getPlan('starter')
    expect(starter.profilePerks.every((perk) => perk.status === 'live')).toBe(
      true
    )
  })

  test('pro e elite entregam algo hoje, não só promessa', () => {
    for (const id of ['pro', 'elite'] as const) {
      const live = getPlan(id).profilePerks.filter(
        (perk) => perk.status === 'live'
      )
      expect(live.length).toBeGreaterThan(0)
    }
  })

  test('identificam o plano sem prometer verificação', () => {
    expect(getPlan('pro').profilePerks).toContainEqual({
      label: 'Selo Pro no perfil',
      status: 'live',
      key: 'badge'
    })
    expect(getPlan('elite').profilePerks).toContainEqual({
      label: 'Selo Elite no topo do perfil',
      status: 'live',
      key: 'badge'
    })

    for (const id of ['pro', 'elite'] as const) {
      expect(
        getPlan(id).profilePerks.some((perk) => /verific/i.test(perk.label))
      ).toBe(false)
    }
  })

  test('cardápio e preço médio são entregues em Pro e Elite, não no Starter', () => {
    const perk = {
      label: 'Link do cardápio e preço médio no perfil',
      status: 'live',
      key: 'menu'
    } as const
    expect(getPlan('pro').profilePerks).toContainEqual(perk)
    expect(getPlan('elite').profilePerks).toContainEqual(perk)
    expect(
      getPlan('starter').profilePerks.some((p) => /cardápio/i.test(p.label))
    ).toBe(false)
  })

  test('lista de quem vai e oferta da casa são entregues só no Elite', () => {
    for (const [label, key] of [
      ['Lista de quem vai assistir, jogo a jogo', 'going'],
      ['Oferta da casa para quem chega pela Onside', 'house_offer']
    ] as const) {
      expect(getPlan('elite').profilePerks).toContainEqual({
        label,
        status: 'live',
        key
      })
      for (const id of ['starter', 'pro'] as const) {
        expect(getPlan(id).profilePerks.some((p) => p.label === label)).toBe(
          false
        )
      }
    }
  })

  test('o que ainda não existe está marcado como tal', () => {
    const roadmap = PLAN_CATALOG.flatMap((plan) =>
      plan.profilePerks.filter((perk) => perk.status === 'soon')
    )
    // Promoções dependem de schema que ainda não existe.
    expect(roadmap.length).toBeGreaterThan(0)
    expect(roadmap.every((perk) => perk.label.length > 0)).toBe(true)
  })
})

describe('getPlanLosses (WEB-351)', () => {
  const labels = (from: 'pro' | 'elite', to: 'starter' | 'pro') =>
    getPlanLosses(from, to).map((loss) => loss.label)

  test('Elite para Pro: só o que o Pro não tem', () => {
    expect(getPlanLosses('elite', 'pro')).toEqual([
      { label: 'Pin exclusivo Elite no mapa' },
      { label: 'Topo na busca por relevância quando há um clássico' },
      { label: 'Histórico completo' },
      { label: 'Inteligência avançada' },
      { label: 'Comparação avançada' },
      { label: 'Selo Elite no topo do perfil', key: 'badge' },
      { label: 'Lista de quem vai assistir, jogo a jogo', key: 'going' },
      {
        label: 'Oferta da casa para quem chega pela Onside',
        key: 'house_offer'
      }
    ])
  })

  test('Pro para Starter: jogos ilimitados, cardápio e o que o Pro põe no perfil', () => {
    const losses = getPlanLosses('pro', 'starter')
    expect(losses).toContainEqual({
      label: 'Jogos ilimitados na agenda',
      key: 'events'
    })
    expect(losses).toContainEqual({
      label: 'Link do cardápio e preço médio no perfil',
      key: 'menu'
    })
    expect(labels('pro', 'starter')).toEqual(
      expect.arrayContaining([
        'Selo Pro no perfil',
        'Capa em destaque, o dobro da altura',
        '12 meses de histórico'
      ])
    )
    expect(labels('pro', 'starter')).not.toContain(
      'Reserva de mesa pela plataforma'
    )
  })

  test('Elite para Starter: soma o que o Elite herda do Pro, com um selo só', () => {
    const lost = labels('elite', 'starter')
    expect(lost).toEqual(
      expect.arrayContaining([
        'Jogos ilimitados na agenda',
        'Capa em destaque, o dobro da altura',
        'Link do cardápio e preço médio no perfil',
        'Selo Elite no topo do perfil',
        'Lista de quem vai assistir, jogo a jogo',
        'Oferta da casa para quem chega pela Onside'
      ])
    )
    expect(lost).not.toContain('Selo Pro no perfil')
    expect(new Set(lost).size).toBe(lost.length)
  })

  test('nunca lista o que o destino tem, promessa nem "Tudo do"', () => {
    for (const [from, to] of [
      ['elite', 'pro'],
      ['pro', 'starter'],
      ['elite', 'starter']
    ] as const) {
      const lost = labels(from, to)
      const target = getPlan(to)
      const soon = getPlan(from)
        .profilePerks.filter((perk) => perk.status === 'soon')
        .map((perk) => perk.label)
      for (const label of [
        ...target.features,
        ...target.profilePerks.map((perk) => perk.label),
        ...soon
      ]) {
        expect(lost).not.toContain(label)
      }
      expect(lost.some((label) => label.startsWith('Tudo do'))).toBe(false)
    }
  })

  test('upgrade e mesmo plano não perdem nada', () => {
    expect(getPlanLosses('starter', 'pro')).toEqual([])
    expect(getPlanLosses('starter', 'elite')).toEqual([])
    expect(getPlanLosses('pro', 'elite')).toEqual([])
    expect(getPlanLosses('pro', 'pro')).toEqual([])
  })
})

describe('getPlanLossNote (WEB-351)', () => {
  const bar = {
    upcomingEvents: 7,
    houseOffer: 'Chopp em dobro',
    menuUrl: 'https://bar.example/cardapio',
    averageSpendCents: 6000
  }
  const empty = {
    upcomingEvents: 0,
    houseOffer: null,
    menuUrl: null,
    averageSpendCents: null
  }

  test('jogos: os do bar contra o limite do Starter, e os já cadastrados continuam (WEB-352)', () => {
    expect(getPlanLossNote('events', bar)).toBe(
      'Você tem 7 jogos futuros. Os jogos já cadastrados continuam no ar, mas no Starter só dá para criar 5 por ciclo de cobrança.'
    )
    expect(getPlanLossNote('events', { ...bar, upcomingEvents: 1 })).toMatch(
      /^Você tem 1 jogo futuro\. /
    )
    expect(getPlanLossNote('events', empty)).toBe(
      'Os jogos já cadastrados continuam no ar, mas no Starter só dá para criar 5 por ciclo de cobrança.'
    )
    // Teste grátis não tem cobrança.
    expect(getPlanLossNote('events', empty, true)).toBe(
      'Os jogos já cadastrados continuam no ar, mas no Starter só dá para criar 5 por mês.'
    )
  })

  test('cardápio e oferta só falam do que o bar tem', () => {
    expect(getPlanLossNote('menu', bar)).toBe(
      'Seu link do cardápio e seu gasto médio saem do perfil e ficam guardados.'
    )
    expect(getPlanLossNote('menu', { ...bar, menuUrl: null })).toBe(
      'Seu gasto médio sai do perfil e fica guardado.'
    )
    expect(getPlanLossNote('house_offer', bar)).toBe(
      'Sua oferta da casa sai do perfil e fica guardada.'
    )
    // A lista de quem vai não tem nada do bar para citar.
    expect(getPlanLossNote('going', bar)).toBeNull()
    for (const key of ['menu', 'house_offer'] as const) {
      expect(getPlanLossNote(key, empty)).toBeNull()
    }
    expect(getPlanLossNote('badge', bar)).toBeNull()
    expect(getPlanLossNote(undefined, bar)).toBeNull()
  })
})

describe('retorno da troca de plano (WEB-351)', () => {
  test('a URL de retorno leva a troca pedida, e a busca a lê de volta', () => {
    const url = new URL(planChangeReturnUrl('elite', 'starter'), 'http://x')
    expect(url.pathname).toBe('/admin/billing')
    expect(parsePlanChange(Object.fromEntries(url.searchParams))).toEqual({
      planFrom: 'elite',
      planTo: 'starter'
    })
  })

  test('busca incompleta, com plano desconhecido ou sem troca não é pedido', () => {
    expect(parsePlanChange({})).toEqual({})
    expect(parsePlanChange({ planTo: 'starter' })).toEqual({})
    expect(parsePlanChange({ planFrom: 'elite', planTo: 'gold' })).toEqual({})
    expect(parsePlanChange({ planFrom: 'pro', planTo: 'pro' })).toEqual({})
    expect(parsePlanChange({ planFrom: ['elite'], planTo: 'pro' })).toEqual({})
  })
})

/** Assinaturas como `pub.getMySubscription` devolve, uma por situação. */
const paid = {
  plan: 'pro',
  status: 'active',
  standing: 'current',
  currentPeriodEnd: '2026-11-08T15:00:00.000Z',
  externalSubscriptionId: 'sub_1'
} as const
const liveTrial = {
  plan: 'elite',
  status: 'trialing',
  standing: 'current',
  currentPeriodEnd: '2026-10-22T15:00:00.000Z',
  externalSubscriptionId: null
} as const
const endedTrial = { ...liveTrial, standing: 'trial_ended' } as const
const pastDue = { ...paid, status: 'past_due', standing: 'past_due' } as const
const ended = { ...paid, status: 'inactive', standing: 'ended' } as const

describe('getPlanPageMode (WEB-249)', () => {
  test('trial do cadastro em vigor é o modo trial', () => {
    expect(getPlanPageMode(liveTrial)).toBe('trial')
  })

  test('trial que já é do Stripe (contratou antes do fim) troca de plano', () => {
    expect(
      getPlanPageMode({ ...liveTrial, externalSubscriptionId: 'sub_1' })
    ).toBe('checkout')
  })

  test('trial vencido sem assinatura no provedor ainda não contratou', () => {
    expect(getPlanPageMode(endedTrial)).toBe('checkout')
  })

  test('assinatura paga parada regulariza, sem checkout novo', () => {
    expect(getPlanPageMode(pastDue)).toBe('regularize')
    expect(
      getPlanPageMode({ ...endedTrial, externalSubscriptionId: 'sub_1' })
    ).toBe('regularize')
  })

  test('sem assinatura, paga em dia ou encerrada passam pelo checkout', () => {
    expect(getPlanPageMode(null)).toBe('checkout')
    expect(getPlanPageMode(undefined)).toBe('checkout')
    expect(getPlanPageMode(paid)).toBe('checkout')
    expect(getPlanPageMode(ended)).toBe('checkout')
  })
})

describe('getDefaultPlanSelection (WEB-249)', () => {
  test('abre no plano da assinatura, nunca abaixo nem em outro', () => {
    for (const plan of ['starter', 'pro', 'elite'] as const) {
      expect(getDefaultPlanSelection({ plan })).toBe(plan)
    }
  })

  test('quem nunca teve assinatura começa no Pro', () => {
    expect(getDefaultPlanSelection(null)).toBe('pro')
    expect(getDefaultPlanSelection(undefined)).toBe('pro')
  })
})

describe('getPlanHeader', () => {
  test('sem assinatura é o último passo do cadastro, sem prometer dias grátis', () => {
    const header = getPlanHeader(null)
    expect(header.kicker).toBe('Último passo')
    expect(header.text).not.toMatch(/\d|grátis/)
  })

  test('assinatura paga parada manda regularizar, com o nome do plano', () => {
    expect(getPlanHeader(pastDue)).toMatchObject({
      kicker: 'Pagamento pendente',
      title: 'Regularize seu plano Pro'
    })
    // Plano parado segue no ar com o Starter.
    expect(getPlanHeader(pastDue).text).toContain(
      'O bar segue no ar com os recursos do Starter'
    )
    expect(
      getPlanHeader({ ...endedTrial, externalSubscriptionId: 'sub_1' }).text
    ).toContain('sem contratar de novo')
  })

  test('trial vencido sem assinatura no provedor chama para contratar', () => {
    const header = getPlanHeader(endedTrial)
    expect(header).toMatchObject({
      kicker: 'Teste encerrado',
      title: 'Seu teste do Elite acabou'
    })
    expect(header.text).toContain('Contrate um plano')
    // Sem contratar, esse bar sai do ar (WEB-357): o que volta é o bar.
    expect(header.text).toContain('voltar às buscas e ao mapa')
    expect(header.text).not.toContain('sem contratar de novo')
  })

  test('trial em vigor diz até quando vai, que não pede cartão e quando sairia a primeira cobrança (WEB-31)', () => {
    const header = getPlanHeader(liveTrial)
    expect(header).toMatchObject({
      kicker: 'Plano e teste',
      title: 'Você está testando o Elite'
    })
    expect(header.text).toContain('O teste grátis não pede cartão.')
    // WEB-358: o teste não é só do plano em que o bar nasceu.
    expect(header.text).toContain(
      'Até 22 de outubro, teste qualquer plano sem mudar a data.'
    )
    expect(header.text).toContain('primeira cobrança só sai em 22 de outubro')
    expect(Object.values(header).join(' ')).not.toMatch(
      /alterar plano|novo plano|ciclo de cobrança|trial/i
    )
  })

  test('paga em dia troca e encerrada reativa', () => {
    expect(getPlanHeader(paid)).toMatchObject({
      kicker: 'Plano e cobrança',
      title: 'Seu plano é o Pro'
    })
    expect(getPlanHeader(ended).kicker).toBe('Reativar plano')
  })

  // WEB-350: o cabeçalho diz o mesmo crédito do aviso de plano inferior.
  test('assinatura paga no Stripe lê que a troca para plano menor vira crédito', () => {
    expect(earnsDowngradeCredit(paid)).toBe(true)
    expect(getPlanHeader(paid).text).toContain(
      'descer vira crédito na sua conta e abate as próximas mensalidades'
    )
  })

  test('sem cobrança no Stripe não há crédito a prometer', () => {
    const contractedTrial = { ...liveTrial, externalSubscriptionId: 'sub_1' }
    const manual = { ...paid, externalSubscriptionId: null }
    for (const subscription of [contractedTrial, manual]) {
      expect(earnsDowngradeCredit(subscription)).toBe(false)
      expect(getPlanHeader(subscription).kicker).toBe('Plano e cobrança')
      expect(getPlanHeader(subscription).text).not.toContain('crédito')
    }
  })

  // WEB-335: com data para acabar, o cabeçalho não convida a trocar de plano.
  test('cancelamento agendado tem cabeçalho próprio, com a data do aviso', () => {
    const header = getPlanHeader({
      ...paid,
      cancelAt: '2026-11-09T15:00:00.000Z'
    })
    expect(header).toEqual({
      kicker: 'Cancela em 09/11',
      title: 'Seu Pro vai até 9 de novembro',
      text: 'Você pediu o cancelamento, e o plano segue até lá. Mudou de ideia? Dá para manter a assinatura.'
    })
  })

  test('data de cancelamento em plano parado ou encerrado não muda o cabeçalho', () => {
    const cancelAt = '2026-11-09T15:00:00.000Z'
    expect(getPlanHeader({ ...pastDue, cancelAt }).kicker).toBe(
      'Pagamento pendente'
    )
    expect(getPlanHeader({ ...ended, cancelAt }).kicker).toBe('Reativar plano')
    expect(getPlanHeader({ ...paid, cancelAt: null }).kicker).toBe(
      'Plano e cobrança'
    )
  })
})

describe('getTrialProgress', () => {
  const end = '2026-10-22T15:00:00.000Z'

  test('conta os dias que faltam e quanto do teste já passou', () => {
    // 90 dias de teste: no começo, nada passou; a 30 dias do fim, 2/3.
    expect(getTrialProgress(end, new Date('2026-07-24T15:00:00.000Z'))).toEqual(
      { daysLeft: 90, elapsed: 0 }
    )
    const late = getTrialProgress(end, new Date('2026-09-22T15:00:00.000Z'))
    expect(late.daysLeft).toBe(30)
    expect(late.elapsed).toBeCloseTo(2 / 3)
  })

  test('relógio adiantado não passa do fim nem de zero dias', () => {
    expect(getTrialProgress(end, new Date('2026-10-23T15:00:00.000Z'))).toEqual(
      { daysLeft: 1, elapsed: 1 }
    )
  })
})

describe('getTrialNotice (WEB-260)', () => {
  const now = new Date('2026-10-08T15:00:00.000Z')
  const trial = {
    status: 'trialing',
    standing: 'current' as const,
    currentPeriodEnd: '2026-10-22T15:00:00.000Z'
  }

  test('diz até quando vai e quantos dias faltam', () => {
    expect(getTrialNotice(trial, now)).toBe(
      'Teste grátis até 22 de outubro de 2026 · faltam 14 dias'
    )
    expect(
      getTrialNotice(
        { ...trial, currentPeriodEnd: new Date('2026-10-08T20:00:00.000Z') },
        now
      )
    ).toBe('Teste grátis até 8 de outubro de 2026 · falta 1 dia')
  })

  test('quem já contratou no Stripe lê a primeira cobrança, não o trial (WEB-347)', () => {
    const contracted = {
      ...trial,
      plan: 'elite' as const,
      externalSubscriptionId: 'sub_1',
      monthlyDiscountReais: 28
    }
    expect(isContractedTrial(contracted)).toBe(true)
    expect(getTrialNotice(contracted, now)).toBe(
      'Primeira cobrança de R$ 269 em 22/10/2026'
    )
    // Sem desconto gravado vale a tabela cheia, como no card do plano.
    expect(
      getTrialNotice({ ...contracted, monthlyDiscountReais: null }, now)
    ).toBe('Primeira cobrança de R$ 297 em 22/10/2026')

    // Sem assinatura no Stripe é o teste do cadastro: o texto de sempre.
    const local = { ...contracted, externalSubscriptionId: null }
    expect(isContractedTrial(local)).toBe(false)
    expect(getTrialNotice(local, now)).toBe(
      'Teste grátis até 22 de outubro de 2026 · faltam 14 dias'
    )

    // Paga em dia ou trial vencido não são trial contratado.
    const active = { ...contracted, status: 'active' }
    expect(isContractedTrial(active)).toBe(false)
    expect(getTrialNotice(active, now)).toBeNull()
    expect(isContractedTrial({ ...contracted, standing: 'trial_ended' })).toBe(
      false
    )
  })

  test('fica calado fora de um trial em vigor', () => {
    expect(getTrialNotice(null, now)).toBeNull()
    expect(getTrialNotice({ ...trial, status: 'active' }, now)).toBeNull()
    expect(
      getTrialNotice({ ...trial, standing: 'trial_ended' }, now)
    ).toBeNull()
    expect(getTrialNotice({ ...trial, currentPeriodEnd: null }, now)).toBeNull()
  })
})

describe('getPlanCardLists', () => {
  test('cada cartão lista só o que acrescenta, e o comum fica fora', () => {
    const common = getCommonPlanItems()
    expect(common).toEqual([
      'Perfil completo com agenda e rota',
      'Contato direto por WhatsApp',
      'Foto de capa',
      'Suporte por e-mail'
    ])
    const [starter, pro, elite] = PLAN_CATALOG.map(getPlanCardLists)
    expect(starter?.lead).toBe('O essencial')
    expect(starter?.profile).toEqual([])
    expect(pro?.lead).toBe('Tudo do Starter, e mais')
    expect(elite?.lead).toBe('Tudo do Pro, e mais')
    expect(elite?.panel).not.toContain('Jogos ilimitados na agenda')
    expect(elite?.profile.map((perk) => perk.label)).toEqual([
      'Selo Elite no topo do perfil',
      'Lista de quem vai assistir, jogo a jogo',
      'Oferta da casa para quem chega pela Onside'
    ])
  })

  test('nenhum item do catálogo some da página', () => {
    const shown = new Set([
      ...getCommonPlanItems(),
      'Perfil do bar no Onside',
      ...PLAN_CATALOG.flatMap((plan) => {
        const lists = getPlanCardLists(plan)
        return [...lists.panel, ...lists.profile.map((perk) => perk.label)]
      })
    ])
    for (const plan of PLAN_CATALOG) {
      for (const label of [
        ...plan.features,
        ...plan.profilePerks.filter((p) => !p.includes).map((p) => p.label)
      ]) {
        expect(shown.has(label)).toBe(true)
      }
    }
  })
})

// WEB-442: anual = 10 meses, com o desconto de fundador também (14/11/2026).
describe('plano anual (WEB-442)', () => {
  test('o anual é 10 meses da tabela e 10 do fundador, por ano', () => {
    expect(billedPlan(getPlan('pro'), 'year')).toMatchObject({
      tablePrice: 1470,
      founderPrice: 1190,
      period: '/ano'
    })
    expect(billedPlan(getPlan('pro'), 'month')).toBe(getPlan('pro'))
    expect(billedPlan(getPlan('pro'))).toBe(getPlan('pro'))
  })

  test('vitrine do anual risca 12 meses do mensal', () => {
    const charge = planChargeForAnnual(annualDeal(getPlan('elite'), false))
    expect(charge).toEqual({ chargeReais: 2970, listReais: 3564, hint: null })
    expect(formatPlanChargeLine(charge, '/ano')).toBe(
      'R$ 2.970/ano (tabela cheia R$ 3.564/ano)'
    )
    expect(planChargeForAnnual(annualDeal(getPlan('elite'), true))).toEqual({
      chargeReais: 2690,
      listReais: 3228,
      hint: null
    })
  })

  test('anual de fundador no card do plano: o ano menos os R$ 280 da fatura', () => {
    expect(
      planChargeForCurrentPlan(
        billedPlan(getPlan('pro'), 'year'),
        { externalSubscriptionId: 'sub_1', monthlyDiscountReais: 280 },
        true
      )
    ).toMatchObject({ chargeReais: 1190, listReais: 1470 })
  })

  test('assinatura anual no card do plano: o valor do ano, sem riscar', () => {
    const plan = billedPlan(getPlan('starter'), 'year')
    expect(
      planChargeForCurrentPlan(
        plan,
        { externalSubscriptionId: 'sub_1', monthlyDiscountReais: 0 },
        true
      )
    ).toEqual({ chargeReais: 970, listReais: null, hint: null })
  })

  test('contratou o anual no teste: a primeira cobrança é a do ano', () => {
    const now = new Date('2026-10-09T12:00:00Z')
    expect(
      getTrialNotice(
        {
          status: 'trialing',
          standing: 'current',
          currentPeriodEnd: '2026-12-01T12:00:00Z',
          plan: 'pro',
          externalSubscriptionId: 'sub_1',
          monthlyDiscountReais: 0,
          billingInterval: 'year'
        },
        now
      )
    ).toBe('Primeira cobrança de R$ 1.470 em 01/12/2026')
  })
})

// O anual sempre economiza dois meses do mensal que o bar pagaria (WEB-442).
describe('conta do anual contra o mensal (WEB-442)', () => {
  test('sem fundador: 10 meses de tabela', () => {
    expect(
      PLAN_CATALOG.map((plan) => annualDeal(plan, false).savingsReais)
    ).toEqual([194, 294, 594])
    expect(annualDeal(getPlan('pro'), false)).toEqual({
      yearReais: 1470,
      perMonthReais: 122.5,
      monthlyReais: 147,
      monthlyYearReais: 1764,
      savingsReais: 294,
      founder: false
    })
  })

  test('com fundador: 10 meses do mensal de fundador', () => {
    expect(
      PLAN_CATALOG.map((plan) => annualDeal(plan, true).yearReais)
    ).toEqual([690, 1190, 2690])
    expect(
      PLAN_CATALOG.map((plan) => annualDeal(plan, true).savingsReais)
    ).toEqual([138, 238, 538])
    expect(annualDeal(getPlan('pro'), true).perMonthReais).toBe(99.17)
  })

  test('reais com centavos só quando há', () => {
    expect(formatReais(122.5)).toBe('R$ 122,50')
    expect(formatReais(80.83)).toBe('R$ 80,83')
    expect(formatReais(1470)).toBe('R$ 1.470')
  })
})
