import { describe, expect, test } from 'bun:test'

import { appConfigDefault } from '@findsports_oficial/api/lib/app-config/registry'
import { TERMOS_DE_USO } from '@/components/legal/termos-de-uso'
import {
  CHECKOUT_ENABLED_DEFAULT,
  earnsDowngradeCredit,
  FOUNDER_DISCOUNT,
  FOUNDER_DISCOUNT_NOTE,
  formatComparison,
  formatHistoryWindow,
  formatPerGame,
  formatPlanChargeLine,
  formatPlanPricing,
  founderCouponFromQuery,
  getAnalyticsEntitlement,
  getDefaultPlanSelection,
  getPlan,
  getPlanExitLink,
  getPlanHeader,
  getPlanLosses,
  getPlanLossNote,
  getPlanPageMode,
  getPlanSelectionState,
  getTrialNotice,
  isContractedTrial,
  isDowngrade,
  PLAN_CATALOG,
  PLAN_TIER_ORDER,
  parsePlanChange,
  parsePlanOrigin,
  planChangeReturnUrl,
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
      expect(plan.analytics).toBeDefined()
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

  test('texto mostra os dois preços, sem percentual nem prazo', () => {
    expect(formatPlanPricing(getPlan('starter'))).toBe(
      'R$ 69/mês com desconto de fundador · tabela cheia R$ 97/mês'
    )
    expect(FOUNDER_DISCOUNT_NOTE).toBe(
      'Com o desconto de fundador aplicado na contratação, R$ 28 por mês a menos que a tabela cheia.'
    )
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

describe('Analytics entitlements', () => {
  test('starter has 30-day history', () => {
    const ent = getAnalyticsEntitlement('starter')
    expect(ent.historyDays).toBe(30)
    expect(ent.perGame).toBe('basic')
    expect(ent.comparison).toBe('previous_period')
  })

  test('pro has 365-day history', () => {
    const ent = getAnalyticsEntitlement('pro')
    expect(ent.historyDays).toBe(365)
    expect(ent.perGame).toBe('complete')
    expect(ent.comparison).toBe('cross_game')
  })

  test('elite has unlimited history', () => {
    const ent = getAnalyticsEntitlement('elite')
    expect(ent.historyDays).toBeNull()
    expect(ent.perGame).toBe('complete')
    expect(ent.comparison).toBe('advanced')
  })

  test('catalog plan analytics match entitlement lookup', () => {
    for (const plan of PLAN_CATALOG) {
      const ent = getAnalyticsEntitlement(plan.id)
      expect(plan.analytics).toEqual(ent)
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

describe('Plan selection state', () => {
  test('mantém todos os planos contratáveis sem plano vigente', () => {
    for (const selected of ['starter', 'pro', 'elite'] as const) {
      expect(getPlanSelectionState(null, selected)).toEqual({
        isDowngrade: false,
        isSamePlan: false
      })
    }
  })

  test('marca apenas o plano vigente como plano atual', () => {
    for (const current of ['starter', 'pro', 'elite'] as const) {
      expect(getPlanSelectionState(current, current)).toEqual({
        isDowngrade: false,
        isSamePlan: true
      })
    }
  })

  test('permite recontratar após a assinatura ficar inativa', () => {
    expect(getPlanSelectionState(null, 'pro').isSamePlan).toBe(false)
  })
})

describe('Saída da tela de planos', () => {
  test.each([
    ['admin', { label: 'Voltar', to: '/admin' }],
    ['billing', { label: 'Voltar', to: '/admin/billing' }]
  ] as const)('volta para %s quando a origem é conhecida', (origin, link) => {
    expect(getPlanExitLink(origin)).toEqual(link)
  })

  test('mostra Ver planos depois e leva ao admin sem origem', () => {
    expect(getPlanExitLink(undefined)).toEqual({
      label: 'Ver planos depois',
      to: '/admin'
    })
  })

  test('trata origem inválida como ausência de origem', () => {
    expect(getPlanExitLink(parsePlanOrigin('https://exemplo.test'))).toEqual({
      label: 'Ver planos depois',
      to: '/admin'
    })
  })
})

describe('Format helpers', () => {
  test('formatHistoryWindow', () => {
    expect(formatHistoryWindow(getAnalyticsEntitlement('starter'))).toBe(
      '30 dias'
    )
    expect(formatHistoryWindow(getAnalyticsEntitlement('pro'))).toBe('12 meses')
    expect(formatHistoryWindow(getAnalyticsEntitlement('elite'))).toBe(
      'Histórico completo'
    )
  })

  test('formatPerGame', () => {
    expect(formatPerGame(getAnalyticsEntitlement('starter'))).toBe(
      'Desempenho básico por jogo'
    )
    expect(formatPerGame(getAnalyticsEntitlement('pro'))).toBe(
      'Analytics completa por jogo'
    )
  })

  test('formatComparison', () => {
    expect(formatComparison(getAnalyticsEntitlement('starter'))).toBe(
      'Comparação com período anterior'
    )
    expect(formatComparison(getAnalyticsEntitlement('pro'))).toBe(
      'Comparação entre jogos e períodos'
    )
    expect(formatComparison(getAnalyticsEntitlement('elite'))).toBe(
      'Comparação avançada'
    )
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

  test('reserva de mesa e oferta da casa são entregues só no Elite', () => {
    for (const [label, key] of [
      ['Reserva de mesa pela plataforma', 'reservations'],
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
    // Galeria e promoções dependem de schema que ainda não existe.
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
      { label: 'Reserva de mesa pela plataforma', key: 'reservations' },
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
        'Reserva de mesa pela plataforma',
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
    averageSpendCents: 6000,
    acceptsReservations: true
  }
  const empty = {
    upcomingEvents: 0,
    houseOffer: null,
    menuUrl: null,
    averageSpendCents: null,
    acceptsReservations: false
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
  })

  test('cardápio, oferta e reservas só falam do que o bar tem', () => {
    expect(getPlanLossNote('menu', bar)).toBe(
      'Seu link do cardápio e seu gasto médio saem do perfil e ficam guardados.'
    )
    expect(getPlanLossNote('menu', { ...bar, menuUrl: null })).toBe(
      'Seu gasto médio sai do perfil e fica guardado.'
    )
    expect(getPlanLossNote('house_offer', bar)).toBe(
      'Sua oferta da casa sai do perfil e fica guardada.'
    )
    expect(getPlanLossNote('reservations', bar)).toBe(
      'Seu bar para de receber novos pedidos de reserva.'
    )
    for (const key of ['menu', 'house_offer', 'reservations'] as const) {
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
      // Selecionado o próprio plano, o botão é "Plano atual", desabilitado.
      expect(
        getPlanSelectionState(plan, getDefaultPlanSelection({ plan }))
      ).toEqual({ isDowngrade: false, isSamePlan: true })
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
      title: 'Regularize seu plano Pro.'
    })
    expect(
      getPlanHeader({ ...endedTrial, externalSubscriptionId: 'sub_1' }).text
    ).toContain('sem contratar de novo')
  })

  test('trial vencido sem assinatura no provedor chama para contratar', () => {
    const header = getPlanHeader(endedTrial)
    expect(header).toMatchObject({
      kicker: 'Trial encerrado',
      title: 'Continue no plano Elite.'
    })
    expect(header.text).toContain('Contrate o plano')
    // Sem contratar, esse bar sai do ar (WEB-357): o que volta é o bar.
    expect(header.text).toContain('voltar às buscas e ao mapa')
    expect(header.text).not.toContain('sem contratar de novo')
  })

  test('trial em vigor diz até quando vai, que não pede cartão e quando sairia a primeira cobrança (WEB-31)', () => {
    const header = getPlanHeader(liveTrial)
    expect(header).toMatchObject({
      kicker: 'Trial gratuito',
      title: 'Você está no trial do Elite até 22 de outubro.'
    })
    expect(header.text).toContain('O teste grátis não pede cartão.')
    expect(header.text).toContain('primeira cobrança só sai em 22 de outubro')
    expect(Object.values(header).join(' ')).not.toMatch(
      /alterar plano|novo plano|ciclo de cobrança/i
    )
  })

  test('paga em dia troca e encerrada reativa', () => {
    expect(getPlanHeader(paid).kicker).toBe('Alterar plano')
    expect(getPlanHeader(ended).kicker).toBe('Reativar plano')
  })

  // WEB-350: o cabeçalho diz o mesmo crédito do aviso de plano inferior.
  test('assinatura paga no Stripe lê que a troca para plano menor vira crédito', () => {
    expect(earnsDowngradeCredit(paid)).toBe(true)
    expect(getPlanHeader(paid).text).toContain(
      'para um menor, vira crédito na sua conta e abate as próximas mensalidades'
    )
  })

  test('sem cobrança no Stripe não há crédito a prometer', () => {
    const contractedTrial = { ...liveTrial, externalSubscriptionId: 'sub_1' }
    const manual = { ...paid, externalSubscriptionId: null }
    for (const subscription of [contractedTrial, manual]) {
      expect(earnsDowngradeCredit(subscription)).toBe(false)
      expect(getPlanHeader(subscription).kicker).toBe('Alterar plano')
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
      kicker: 'Cancelamento agendado',
      title: 'Seu plano Pro cancela em 09/11.',
      text: 'O plano segue até lá. Para continuar depois dessa data, reative a assinatura.'
    })
  })

  test('data de cancelamento em plano parado ou encerrado não muda o cabeçalho', () => {
    const cancelAt = '2026-11-09T15:00:00.000Z'
    expect(getPlanHeader({ ...pastDue, cancelAt }).kicker).toBe(
      'Pagamento pendente'
    )
    expect(getPlanHeader({ ...ended, cancelAt }).kicker).toBe('Reativar plano')
    expect(getPlanHeader({ ...paid, cancelAt: null }).kicker).toBe(
      'Alterar plano'
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
      'Trial gratuito até 22 de outubro de 2026 · faltam 14 dias'
    )
    expect(
      getTrialNotice(
        { ...trial, currentPeriodEnd: new Date('2026-10-08T20:00:00.000Z') },
        now
      )
    ).toBe('Trial gratuito até 8 de outubro de 2026 · falta 1 dia')
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
      'Trial gratuito até 22 de outubro de 2026 · faltam 14 dias'
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

test('padrão do checkout na tela é o mesmo do servidor', () => {
  expect(CHECKOUT_ENABLED_DEFAULT).toBe(
    appConfigDefault('billing.checkout_enabled')
  )
})
