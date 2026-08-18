import { describe, expect, test } from 'bun:test'

import {
  formatComparison,
  formatHistoryWindow,
  formatPerGame,
  getAnalyticsEntitlement,
  getPlan,
  isDowngrade,
  PLAN_CATALOG,
  PLAN_TIER_ORDER
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
      expect(plan.price).toBeTruthy()
      expect(plan.period).toBeTruthy()
      expect(plan.features).toBeInstanceOf(Array)
      expect(plan.features.length).toBeGreaterThan(0)
      expect(plan.analytics).toBeDefined()
    }
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
    expect(elite.features).toContain('Histórico completo')
    expect(elite.features).toContain('Inteligência avançada')
  })
})
