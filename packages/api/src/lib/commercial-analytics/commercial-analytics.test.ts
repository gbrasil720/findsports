import { describe, expect, it } from 'bun:test'
import { TRPCError } from '@trpc/server'
import {
  applyOverviewEntitlements,
  assertRecordable,
  COMMERCIAL_EVENT_TYPES,
  canViewEventType,
  getAnalyticsEntitlements,
  pctChange,
  RECORD_FAILURES
} from './index'
import type { AnalyticsOverview } from './types'

describe('commercial-analytics types', () => {
  it('has 4 canonical event types', () => {
    expect(COMMERCIAL_EVENT_TYPES).toHaveLength(4)
    expect(COMMERCIAL_EVENT_TYPES).toContain('profile_view')
    expect(COMMERCIAL_EVENT_TYPES).toContain('directions_opened')
    expect(COMMERCIAL_EVENT_TYPES).toContain('phone_clicked')
    expect(COMMERCIAL_EVENT_TYPES).toContain('whatsapp_opened')
  })

  it('pctChange calculates correctly', () => {
    expect(pctChange(100, 80)).toBe(25)
    expect(pctChange(80, 100)).toBe(-20)
    expect(pctChange(100, 100)).toBe(0)
    expect(pctChange(0, 0)).toBe(0)
    expect(pctChange(10, 0)).toBeNull()
  })
})

describe('recusa de registro de evento (ESC-06)', () => {
  it('deixa passar quando o banco devolve ok', () => {
    expect(() => assertRecordable('ok')).not.toThrow()
  })

  it('preserva o código e a mensagem de cada recusa', () => {
    const esperado = [
      ['impersonated', 'FORBIDDEN'],
      ['bar_not_found', 'NOT_FOUND'],
      ['bar_inactive', 'FORBIDDEN'],
      ['event_mismatch', 'BAD_REQUEST'],
      ['no_phone', 'BAD_REQUEST'],
      ['no_whatsapp', 'BAD_REQUEST'],
      ['rate_limited', 'TOO_MANY_REQUESTS']
    ] as const

    for (const [motivo, code] of esperado) {
      try {
        assertRecordable(motivo)
        throw new Error(`${motivo} deveria ter lançado`)
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError)
        expect((err as TRPCError).code).toBe(code)
        expect((err as TRPCError).message).toBe(RECORD_FAILURES[motivo].message)
      }
    }
  })

  it('trata motivo desconhecido como erro interno, não como sucesso', () => {
    try {
      assertRecordable('motivo_que_nao_existe')
      throw new Error('deveria ter lançado')
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError)
      expect((err as TRPCError).code).toBe('INTERNAL_SERVER_ERROR')
    }
  })

  it('cobre todos os motivos que o SQL pode devolver', () => {
    // Se alguém adicionar um WHEN novo no CASE sem mapear aqui, o motivo
    // viraria INTERNAL_SERVER_ERROR em produção. Esta lista é o contrato.
    expect(Object.keys(RECORD_FAILURES).sort()).toEqual([
      'bar_inactive',
      'bar_not_found',
      'event_mismatch',
      'impersonated',
      'no_phone',
      'no_whatsapp',
      'rate_limited'
    ])
  })
})

describe('commercial-analytics entitlements', () => {
  it('starter has only profile_view', () => {
    const e = getAnalyticsEntitlements('starter')
    expect(e.canViewAnalytics).toBe(true)
    expect(e.canViewPhoneClicked).toBe(false)
    expect(e.canViewWhatsappOpened).toBe(false)
    expect(e.canViewDirectionsOpened).toBe(false)
    expect(e.canViewComparison).toBe(true)
    expect(e.canViewDailyBreakdown).toBe(false)
    expect(e.canViewEventBreakdown).toBe(false)
    expect(e.maxDaysRetention).toBe(30)
  })

  it('pro has phone clicked and whatsapp opened', () => {
    const e = getAnalyticsEntitlements('pro')
    expect(e.canViewAnalytics).toBe(true)
    expect(e.canViewPhoneClicked).toBe(true)
    expect(e.canViewWhatsappOpened).toBe(true)
    expect(e.canViewDirectionsOpened).toBe(false)
    expect(e.canViewComparison).toBe(true)
    expect(e.canViewDailyBreakdown).toBe(false)
    expect(e.canViewEventBreakdown).toBe(false)
    expect(e.maxDaysRetention).toBe(365)
  })

  it('elite has all entitlements', () => {
    const e = getAnalyticsEntitlements('elite')
    expect(e.canViewAnalytics).toBe(true)
    expect(e.canViewPhoneClicked).toBe(true)
    expect(e.canViewWhatsappOpened).toBe(true)
    expect(e.canViewDirectionsOpened).toBe(true)
    expect(e.canViewComparison).toBe(true)
    expect(e.canViewDailyBreakdown).toBe(true)
    expect(e.canViewEventBreakdown).toBe(true)
    expect(e.maxDaysRetention).toBe(null)
  })

  it('each plan has unique entitlements', () => {
    const starter = getAnalyticsEntitlements('starter')
    const pro = getAnalyticsEntitlements('pro')
    const elite = getAnalyticsEntitlements('elite')

    expect(JSON.stringify(starter)).not.toEqual(JSON.stringify(pro))
    expect(JSON.stringify(pro)).not.toEqual(JSON.stringify(elite))
    expect(JSON.stringify(starter)).not.toEqual(JSON.stringify(elite))
  })

  it('canViewEventType returns correct values', () => {
    expect(canViewEventType('starter', 'profile_view')).toBe(true)
    expect(canViewEventType('starter', 'phone_clicked')).toBe(false)
    expect(canViewEventType('pro', 'phone_clicked')).toBe(true)
    expect(canViewEventType('pro', 'directions_opened')).toBe(false)
    expect(canViewEventType('elite', 'directions_opened')).toBe(true)
    expect(canViewEventType('elite', 'whatsapp_opened')).toBe(true)
    expect(canViewEventType('starter', 'unknown')).toBe(false)
  })
})

describe('commercial-analytics formulas', () => {
  it('pctChange rounds to integer', () => {
    expect(pctChange(101, 100)).toBe(1)
    expect(pctChange(90, 100)).toBe(-10)
    expect(pctChange(150, 100)).toBe(50)
  })

  it('pctChange handles edge cases', () => {
    expect(pctChange(0, 0)).toBe(0)
    expect(pctChange(10, 0)).toBeNull()
    expect(pctChange(0, 100)).toBe(-100)
  })
})

describe('commercial-analytics recorder', () => {
  it('returns the inserted row so a successful write triggers the rollup', async () => {
    const source = await Bun.file(`${import.meta.dir}/recorder.ts`).text()

    expect(source).toMatch(
      /ON CONFLICT \(bar_id, actor_user_id, type, commercial_day, source_event_id\) DO NOTHING\s+RETURNING id/
    )
  })
})

/* ------------------------------------------------------------------ */
/* applyOverviewEntitlements — complete object per plan (WEB-89)       */
/*                                                                     */
/* Contracto: o objeto inteiro devolvido a cada plano é o contrato.    */
/* Se o catálogo/spec anunciam comparação para o Starter, o servidor   */
/* deve entregar comparação nas métricas que o plano enxerga — e nunca */
/* vazar campos comparativos bloqueados via spread.                    */
/* ------------------------------------------------------------------ */

const DAY = (n: number) => ({ date: '2026-09-01', value: n })

const OVERVIEW_RAW: AnalyticsOverview = {
  uniqueVisitors: 100,
  interestedPeople: 30,
  highIntentActions: 12,
  profileViews: 240,
  directionsOpened: 8,
  phoneClicked: 3,
  whatsappOpened: 4,

  uniqueVisitorsPrev: 80,
  interestedPeoplePrev: 25,
  highIntentActionsPrev: 9,
  profileViewsPrev: 200,
  directionsOpenedPrev: 6,
  phoneClickedPrev: 2,
  whatsappOpenedPrev: 3,

  uniqueVisitorsChange: 25,
  interestedPeopleChange: 20,
  highIntentActionsChange: 33,
  profileViewsChange: 20,
  directionsOpenedChange: 33,
  phoneClickedChange: 50,
  whatsappOpenedChange: 33,

  dailyProfileViews: [DAY(10)],
  dailyDirectionsOpened: [DAY(1)],
  dailyPhoneClicked: [DAY(1)],
  dailyWhatsappOpened: [DAY(1)],

  from: '2026-09-01',
  to: '2026-09-30'
}

const overviewFor = (plan: 'starter' | 'pro' | 'elite') =>
  applyOverviewEntitlements(OVERVIEW_RAW, getAnalyticsEntitlements(plan))

describe('applyOverviewEntitlements — objeto completo por plano', () => {
  it('starter: catálogo anuncia comparação com período anterior e ela chega', () => {
    expect(overviewFor('starter')).toEqual({
      uniqueVisitors: 100,
      interestedPeople: 30,
      highIntentActions: 12,
      profileViews: 240,
      directionsOpened: null,
      phoneClicked: null,
      whatsappOpened: null,

      uniqueVisitorsPrev: 80,
      interestedPeoplePrev: 25,
      highIntentActionsPrev: 9,
      profileViewsPrev: 200,
      directionsOpenedPrev: null,
      phoneClickedPrev: null,
      whatsappOpenedPrev: null,

      uniqueVisitorsChange: 25,
      interestedPeopleChange: 20,
      highIntentActionsChange: 33,
      profileViewsChange: 20,
      directionsOpenedChange: null,
      phoneClickedChange: null,
      whatsappOpenedChange: null,

      dailyProfileViews: null,
      dailyDirectionsOpened: null,
      dailyPhoneClicked: null,
      dailyWhatsappOpened: null,

      from: '2026-09-01',
      to: '2026-09-30'
    })
  })

  it('pro: comparação dos canais liberados, sem directions', () => {
    expect(overviewFor('pro')).toEqual({
      uniqueVisitors: 100,
      interestedPeople: 30,
      highIntentActions: 12,
      profileViews: 240,
      directionsOpened: null,
      phoneClicked: 3,
      whatsappOpened: 4,

      uniqueVisitorsPrev: 80,
      interestedPeoplePrev: 25,
      highIntentActionsPrev: 9,
      profileViewsPrev: 200,
      directionsOpenedPrev: null,
      phoneClickedPrev: 2,
      whatsappOpenedPrev: 3,

      uniqueVisitorsChange: 25,
      interestedPeopleChange: 20,
      highIntentActionsChange: 33,
      profileViewsChange: 20,
      directionsOpenedChange: null,
      phoneClickedChange: 50,
      whatsappOpenedChange: 33,

      dailyProfileViews: null,
      dailyDirectionsOpened: null,
      dailyPhoneClicked: null,
      dailyWhatsappOpened: null,

      from: '2026-09-01',
      to: '2026-09-30'
    })
  })

  it('elite: objeto completo, sem campos bloqueados', () => {
    expect(overviewFor('elite')).toEqual({
      uniqueVisitors: 100,
      interestedPeople: 30,
      highIntentActions: 12,
      profileViews: 240,
      directionsOpened: 8,
      phoneClicked: 3,
      whatsappOpened: 4,

      uniqueVisitorsPrev: 80,
      interestedPeoplePrev: 25,
      highIntentActionsPrev: 9,
      profileViewsPrev: 200,
      directionsOpenedPrev: 6,
      phoneClickedPrev: 2,
      whatsappOpenedPrev: 3,

      uniqueVisitorsChange: 25,
      interestedPeopleChange: 20,
      highIntentActionsChange: 33,
      profileViewsChange: 20,
      directionsOpenedChange: 33,
      phoneClickedChange: 50,
      whatsappOpenedChange: 33,

      dailyProfileViews: [DAY(10)],
      dailyDirectionsOpened: [DAY(1)],
      dailyPhoneClicked: [DAY(1)],
      dailyWhatsappOpened: [DAY(1)],

      from: '2026-09-01',
      to: '2026-09-30'
    })
  })

  it('sem canViewComparison nenhum campo comparativo vaza (regressão WEB-89)', () => {
    const plano = {
      ...getAnalyticsEntitlements('pro'),
      canViewComparison: false
    }
    const res = applyOverviewEntitlements(OVERVIEW_RAW, plano)

    expect(res.uniqueVisitorsPrev).toBeNull()
    expect(res.interestedPeoplePrev).toBeNull()
    expect(res.highIntentActionsPrev).toBeNull()
    expect(res.profileViewsPrev).toBeNull()
    expect(res.uniqueVisitorsChange).toBeNull()
    expect(res.interestedPeopleChange).toBeNull()
    expect(res.highIntentActionsChange).toBeNull()
    expect(res.profileViewsChange).toBeNull()
    expect(res.phoneClickedPrev).toBeNull()
    expect(res.whatsappOpenedPrev).toBeNull()
    expect(res.directionsOpenedPrev).toBeNull()
  })
})
